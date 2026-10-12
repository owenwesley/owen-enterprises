/**
 * db/maintenance/moveTimestampsLast.js
 *
 * Moves the `createdAt` and `updatedAt` columns to the END of the column list
 * in every table of all five databases that has them (createdAt first, then
 * updatedAt, after every other column).
 *
 * New databases get this order straight from db/init.js (1.12.2). A database
 * created earlier keeps its old column order, because start-up only ever ADDS
 * missing columns, so run this once on it:
 *
 *   node db/maintenance/moveTimestampsLast.js            report only (changes nothing)
 *   node db/maintenance/moveTimestampsLast.js --apply    do it
 *
 * On a database made by 1.11.x that is typically `mfa_trusted_devices` (createdAt
 * sits before expiresAt and lastUsedAt) and `borrow_requests` (createdAt sits before
 * answeredAt, auto,
 * hideOwner, hideRequester); the report lists exactly which tables on YOUR database; every other table is already in order and is
 * left alone. Only a column's POSITION changes: its type, default, NULL-ness
 * and every row's value stay exactly as they are (the column definition is
 * read back from SHOW CREATE TABLE and re-used word for word). Nothing in the
 * app addresses these columns by position, so no code change is needed.
 *
 * Each table is one ALTER TABLE per column. That rewrites the table, so run it
 * when nobody is using the app, and take a database backup first. A table that
 * is already in order is skipped, so running it again is harmless.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), quiet: true });
const { q, qt, makePool, dbNames } = require('./idRefs');

const STAMPS = ['createdAt', 'updatedAt'];   // the order they must end up in

/** Column names of a table, in their current order. */
async function liveColumns(conn, schema, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [schema, table]
  );
  return rows.map((r) => r.name);
}

/** The exact definition text of one column ("`createdAt` timestamp NOT NULL DEFAULT ...") from SHOW CREATE TABLE. */
async function columnDefinition(conn, schema, table, column) {
  const [rows] = await conn.query(`SHOW CREATE TABLE ${qt(schema, table)}`);
  const text = String(rows[0]['Create Table']);
  const prefix = '`' + column + '` ';
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.startsWith(prefix));
  if (!line) throw new Error(`could not find the definition of ${column} in SHOW CREATE TABLE ${table}`);
  return line.replace(/,$/, '');
}

/**
 * For one table: the ALTERs needed (empty if already in order).
 * Returns { before, after, steps: [{ column, sql }] }.
 */
async function plan(conn, schema, table) {
  const before = await liveColumns(conn, schema, table);
  const stamps = STAMPS.filter((c) => before.includes(c));
  if (stamps.length === 0) return null;
  const rest = before.filter((c) => !STAMPS.includes(c));
  const after = [...rest, ...stamps];
  if (after.join('|') === before.join('|')) return { before, after, steps: [] };

  const steps = [];
  let prev = rest[rest.length - 1];
  for (const col of stamps) {
    const def = await columnDefinition(conn, schema, table, col);
    steps.push({ column: col, sql: `ALTER TABLE ${qt(schema, table)} MODIFY COLUMN ${def} AFTER ${q(prev)}` });
    prev = col;
  }
  return { before, after, steps };
}

async function main(apply) {
  const pool = makePool();
  const conn = await pool.getConnection();
  try {
    const [tables] = await conn.query(
      `SELECT TABLE_SCHEMA AS s, TABLE_NAME AS t FROM information_schema.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA IN (?)
          AND TABLE_NAME NOT LIKE '%\\_rebuild\\_%'
        ORDER BY TABLE_SCHEMA, TABLE_NAME`,
      [Object.values(dbNames())]
    );

    const todo = [];
    let already = 0;
    for (const { s, t } of tables) {
      const p = await plan(conn, s, t);
      if (!p) continue;
      if (p.steps.length === 0) { already++; continue; }
      todo.push({ schema: s, table: t, ...p });
    }

    console.log(`${already} table(s) with createdAt/updatedAt already have them last.`);
    if (todo.length === 0) { console.log('Nothing to do.'); return { moved: 0 }; }

    for (const x of todo) {
      console.log(`\n${x.schema}.${x.table}`);
      console.log(`  now:   ${x.before.join(', ')}`);
      console.log(`  after: ${x.after.join(', ')}`);
    }
    if (!apply) {
      console.log('\nReport only, nothing changed. Back up the databases, then re-run with --apply.');
      return { moved: 0, pending: todo.length };
    }

    for (const x of todo) {
      for (const st of x.steps) await conn.query(st.sql);
      const now = await liveColumns(conn, x.schema, x.table);
      if (now.join('|') !== x.after.join('|')) {
        throw new Error(`${x.schema}.${x.table}: order is ${now.join(', ')} after the change, expected ${x.after.join(', ')}`);
      }
      console.log(`  moved ${x.schema}.${x.table}`);
    }
    console.log(`\nDone: ${todo.length} table(s) changed.`);
    return { moved: todo.length };
  } finally {
    conn.release();
    await pool.end();
  }
}

if (require.main === module) {
  main(process.argv.slice(2).includes('--apply'))
    .then(() => process.exit(0))
    .catch((e) => { console.error('moveTimestampsLast failed:', e.message); process.exit(1); });
}

module.exports = main;
module.exports.plan = plan;
