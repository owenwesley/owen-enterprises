/**
 * db/maintenance/rebuildTable.js
 *
 * Standalone maintenance CLI. Nothing in server.js, db/init.js, or any route
 * imports this file; the only caller is db/maintenance/scheduleRebuild.js
 * (opt-in, off by default).
 *
 * WHAT IT DOES
 * ------------
 * Physically rewrites one table and, by default, RENUMBERS ITS `id` COLUMN so
 * the ids run 1, 2, 3 ... N with no gaps (N = number of rows), keeping every
 * other column of every row exactly as it was:
 *
 *   before:  id = 1, 2, 5, 9, 40            after:  id = 1, 2, 3, 4, 5
 *
 * New ids are handed out in the order of the OLD ids (so rows keep their
 * relative order), or in the order given by --reorder. The table's
 * AUTO_INCREMENT counter is then set to N + 1, so the next insert gets N + 1.
 *
 * USAGE (manual, one-off):
 *   node db/maintenance/rebuildTable.js <table> <database>
 *   node db/maintenance/rebuildTable.js <table> <database> --reorder="date, id"
 *   node db/maintenance/rebuildTable.js <table> <database> --keep-ids
 *   Users, test accounts last (what the weekly job does for `users`):
 *   node db/maintenance/rebuildTable.js users owenenterprises --reorder="(`userName` LIKE 'test%'), `id`"
 *
 *   --reorder="<ORDER BY list>"  hand out the new ids in this order instead of
 *                                old-id order (e.g. "name, id").
 *   --keep-ids                   old behaviour: rewrite the table but leave ids
 *                                and the AUTO_INCREMENT counter as they were.
 *
 * WHAT ELSE POINTS AT AN id (why renumbering is not just a table copy)
 * ---------------------------------------------------------------------
 * Renumbering `readings.id` touches nothing else, but two tables are
 * REFERENCED by other tables, and those references have to move with the ids
 * or every row would silently be re-attached to the wrong person/clinic:
 *
 *   users.id    <- users' `user_id` in every table of all four databases
 *                  (bgtracker, communitylibrary, meetings and
 *                  feature_preferences have NO foreign key on it, it is just
 *                  a number), plus doctor_profiles.user_id and
 *                  doctor_patients.doctor_id / patient_id (real FKs).
 *   clinics.id  <- doctor_profiles.clinic_id (real FK) and
 *                  doctor_profiles.requestedClinicId (plain number).
 *
 * Any real foreign key found in information_schema is remapped too. The
 * plain-number references above are listed in ID_REFERENCES below; if a new
 * table ever stores another table's id as a bare column, add it there.
 *
 * SAFETY CHECKS BEFORE ANY REMAP
 *   - Every table that references the one being renumbered must be InnoDB
 *     (the remap runs in one transaction so it is all-or-nothing).
 *   - No referencing row may point at an id that doesn't exist (an "orphan").
 *     After a renumber that stale number could land on a DIFFERENT row, e.g. a
 *     deleted user's readings would become some other user's. If any orphan
 *     exists the rebuild of that table is refused and the counts are printed;
 *     nothing is changed.
 *   - If the remap fails, the swap is undone, the original table is back.
 *
 * HOW THE REWRITE WORKS (unchanged from earlier versions)
 *   - Never drops the live table. The replacement is built as
 *     `<table>_rebuild_tmp`, then an atomic RENAME TABLE swap puts it live.
 *   - `CREATE TABLE ... LIKE` does not carry the AUTO_INCREMENT counter or
 *     foreign keys, so both are reapplied explicitly (outgoing FKs recreated,
 *     incoming FKs redirected off the `_rebuild_old` table before it is
 *     dropped; ON DELETE / ON UPDATE rules preserved).
 *   - The copy runs under LOCK TABLES on one dedicated connection.
 *   - Refuses to run if `<table>_rebuild_old` already exists (a previous run
 *     died after the swap; a human should inspect it).
 *
 * WHAT A RUNNING APP SEES
 *   Renumbering `users` changes every user's id. A login token carries the
 *   user's id, so middleware/auth.js now also checks the token's id + userName
 *   still match a users row; a token issued before the renumber is rejected
 *   (401) and the person simply logs in again. Open browser tabs also hold the
 *   old ids until the page is reloaded.
 */
// Load the project's .env so this works when run directly from a terminal
// (server.js does this for the app, but standalone scripts start with an empty
// environment and would otherwise fall back to root / no password). Resolved
// from the project root so it works from any directory; dotenv never overrides
// variables that are already set, so `DB_PASS=x node ...` still wins.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), quiet: true });
const mysql = require('mysql2');
const { dbNames } = require('../init');

const INT_TYPES = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint']);
const MAX_SAFE_ID = 2147483647;   // conservative: signed INT

/**
 * Columns that hold another table's id as a plain number (no FOREIGN KEY, so
 * information_schema can't find them). Keyed by the referenced table, which is
 * always in the gateway database. The columns are searched for by name in
 * every table of all four databases.
 */
const ID_REFERENCES = {
  users:   ['user_id', 'doctor_id', 'patient_id'],
  clinics: ['clinic_id', 'requestedClinicId'],
};

function parseArgs(argv) {
  const [table, dbName, ...rest] = argv;
  if (!table || !dbName) {
    throw new Error(
      'Usage: node db/maintenance/rebuildTable.js <table> <database> [--reorder="col1, col2"] [--keep-ids]'
    );
  }
  const reorderArg = rest.find((a) => a.startsWith('--reorder='));
  const reorderBy = reorderArg ? reorderArg.slice('--reorder='.length) : null;
  const renumber = !rest.includes('--keep-ids');
  return { table, dbName, reorderBy, renumber };
}

const q = (name) => `\`${name}\``;
const qt = (schema, name) => `${q(schema)}.${q(name)}`;

async function rebuildTable({ table, dbName, reorderBy = null, renumber = true }) {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    port: Number(process.env.DB_PORT) || 3306,
    database: dbName,
  });

  // A single dedicated connection for the whole operation: LOCK TABLES,
  // transactions and SET FOREIGN_KEY_CHECKS are session-scoped, and
  // pool.query() does not guarantee the same underlying connection.
  const promisePool = pool.promise();
  const conn = await promisePool.getConnection();

  const tmpName = `${table}_rebuild_tmp`;
  const oldName = `${table}_rebuild_old`;
  const mapName = `${table}_rebuild_map`;
  let swapped = false;

  try {
    const [before] = await conn.query(`SELECT COUNT(*) AS n, MIN(id) AS lo, MAX(id) AS hi FROM ${q(table)}`);
    const rowCount = Number(before[0].n);
    console.log(`  ${table}: ${rowCount} row(s) before rebuild`);

    // --- Can/should ids be renumbered on this table? ---
    const [idCol] = await conn.query(
      `SELECT DATA_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'id'`,
      [dbName, table]
    );
    let doRenumber = renumber;
    if (doRenumber && !(idCol[0] && INT_TYPES.has(String(idCol[0].DATA_TYPE).toLowerCase()))) {
      console.log(`  ${table}: no integer \`id\` column, ids left as they are`);
      doRenumber = false;
    }

    // --- Everything that CREATE TABLE ... LIKE will lose or get wrong ---
    const [aiRows] = await conn.query(
      `SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [dbName, table]
    );
    const sourceAutoIncrement = aiRows[0] ? aiRows[0].AUTO_INCREMENT : null;

    const [outgoingFKs] = await conn.query(
      `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [dbName, table]
    );
    const [outgoingRC] = await conn.query(
      `SELECT CONSTRAINT_NAME, UPDATE_RULE, DELETE_RULE
       FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ?`,
      [dbName, table]
    );
    const [incomingFKs] = await conn.query(
      `SELECT TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE REFERENCED_TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME = ?`,
      [dbName, table]
    );
    const [incomingRC] = await conn.query(
      `SELECT rc.CONSTRAINT_SCHEMA, rc.CONSTRAINT_NAME, rc.TABLE_NAME, rc.UPDATE_RULE, rc.DELETE_RULE
       FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
       WHERE rc.REFERENCED_TABLE_NAME = ? AND rc.UNIQUE_CONSTRAINT_SCHEMA = ?`,
      [table, dbName]
    );

    if (outgoingFKs.length > 0) {
      console.log(`  ${table}: found ${outgoingFKs.length} outgoing foreign key constraint(s) — will be recreated`);
    }
    if (incomingFKs.length > 0) {
      console.log(`  ${table}: found ${incomingFKs.length} incoming foreign key reference(s) — will be redirected`);
    }

    // --- Every column, in other tables, that stores one of this table's ids ---
    let refs = [];
    if (doRenumber) {
      const seen = new Set();
      const add = (schema, tbl, col) => {
        const key = `${schema}.${tbl}.${col}`;
        if (schema === dbName && tbl === table) return;
        if (seen.has(key)) return;
        seen.add(key);
        refs.push({ schema, table: tbl, column: col });
      };
      for (const fk of incomingFKs) add(fk.TABLE_SCHEMA, fk.TABLE_NAME, fk.COLUMN_NAME);

      const gateway = dbNames().gateway;
      const plainCols = dbName === gateway ? ID_REFERENCES[table] : null;
      if (plainCols) {
        const [found] = await conn.query(
          `SELECT c.TABLE_SCHEMA AS s, c.TABLE_NAME AS t, c.COLUMN_NAME AS col
             FROM information_schema.COLUMNS c
             JOIN information_schema.TABLES tb
               ON tb.TABLE_SCHEMA = c.TABLE_SCHEMA AND tb.TABLE_NAME = c.TABLE_NAME
            WHERE tb.TABLE_TYPE = 'BASE TABLE'
              AND c.TABLE_SCHEMA IN (?)
              AND c.COLUMN_NAME IN (?)
              AND c.TABLE_NAME NOT LIKE '%\\_rebuild\\_%'`,
          [Object.values(dbNames()), plainCols]
        );
        for (const r of found) add(r.s, r.t, r.col);
      }
    }

    // --- Reference safety: decide up front, change nothing yet ---
    // Skipped only when there is nothing that could go stale: no references.
    if (doRenumber && refs.length > 0) {
      const tables = [...new Set(refs.map((r) => `${r.schema}.${r.table}`))];
      const [engines] = await conn.query(
        `SELECT TABLE_SCHEMA, TABLE_NAME, ENGINE FROM information_schema.TABLES
          WHERE CONCAT(TABLE_SCHEMA, '.', TABLE_NAME) IN (?)`,
        [tables]
      );
      const notInno = engines.filter((e) => String(e.ENGINE).toLowerCase() !== 'innodb');
      if (notInno.length) {
        throw new Error(
          `refusing to renumber \`${table}\`: ${notInno.map((e) => `${e.TABLE_SCHEMA}.${e.TABLE_NAME}`).join(', ')} ` +
          `is not InnoDB, so its ids can't be remapped transactionally. Nothing was changed.`
        );
      }

      const orphans = [];
      for (const r of refs) {
        const [[o]] = await conn.query(
          `SELECT COUNT(*) AS n FROM ${qt(r.schema, r.table)} c
            WHERE c.${q(r.column)} IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM ${q(table)} p WHERE p.id = c.${q(r.column)})`
        );
        if (Number(o.n) > 0) orphans.push(`${r.schema}.${r.table}.${r.column} (${o.n} row(s))`);
      }
      if (orphans.length) {
        throw new Error(
          `refusing to renumber \`${table}\`: these rows point at an id that doesn't exist in \`${table}\`: ` +
          `${orphans.join('; ')}. After a renumber that stale number could belong to a different row. ` +
          `Fix or delete them, then re-run. Nothing was changed.`
        );
      }
      console.log(`  ${table}: ${refs.length} referencing column(s) checked, no orphans:`);
      for (const r of refs) console.log(`      ${r.schema}.${r.table}.${r.column}`);
    }

    // A leftover `_rebuild_old` means a previous run died AFTER the swap. In
    // that state the live table may be missing constraints that only the old
    // table still has, so silently dropping it here would make that loss
    // permanent. Stop and let a human inspect it instead. (`_rebuild_tmp` and
    // `_rebuild_map` are only ever scratch tables, safe to discard.)
    const [leftover] = await conn.query(
      `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [dbName, oldName]
    );
    if (leftover.length > 0) {
      throw new Error(
        `\`${oldName}\` already exists — a previous rebuild of \`${table}\` was interrupted after the swap. ` +
        `Compare \`${table}\` with \`${oldName}\` (row counts and foreign keys) and drop or restore by hand before re-running.`
      );
    }
    await conn.query(`DROP TABLE IF EXISTS ${q(tmpName)}`);
    await conn.query(`DROP TABLE IF EXISTS ${q(mapName)}`);

    await conn.query(`CREATE TABLE ${q(tmpName)} LIKE ${q(table)}`);

    // Column list for the explicit INSERT ... SELECT (avoids `SELECT *`
    // depending on column order, and lets `id` come from the map).
    const [colRows] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [dbName, table]
    );
    const cols = colRows.map((c) => c.COLUMN_NAME);

    // --- Copy window, under LOCK TABLES on the dedicated connection ---
    let copyResult;
    let idChanges = 0;
    let maxOld = 0;
    if (doRenumber) {
      // Old-id -> new-id map. The AUTO_INCREMENT on new_id hands out 1..N in
      // the order the rows are inserted (old-id order, or --reorder).
      await conn.query(
        `CREATE TABLE ${q(mapName)} (new_id INT AUTO_INCREMENT PRIMARY KEY, old_id INT NOT NULL UNIQUE) ENGINE=InnoDB`
      );
      await conn.query(`LOCK TABLES ${q(table)} READ, ${q(tmpName)} WRITE, ${q(mapName)} WRITE`);
      try {
        const order = reorderBy ? reorderBy : 'id';
        await conn.query(`INSERT INTO ${q(mapName)} (old_id) SELECT id FROM ${q(table)} ORDER BY ${order}`);

        const [[m]] = await conn.query(
          `SELECT COUNT(*) AS n, MIN(new_id) AS lo, MAX(new_id) AS hi, MAX(old_id) AS maxOld,
                  SUM(new_id <> old_id) AS changed FROM ${q(mapName)}`
        );
        if (Number(m.n) !== rowCount || (rowCount > 0 && (Number(m.lo) !== 1 || Number(m.hi) !== rowCount))) {
          throw new Error(
            `id map is not 1..${rowCount} (rows=${m.n}, min=${m.lo}, max=${m.hi}); table changed during the run or ` +
            `AUTO_INCREMENT allocated with gaps. Nothing was changed.`
          );
        }
        idChanges = Number(m.changed || 0);
        maxOld = Number(m.maxOld || 0);

        // No aliases: LOCK TABLES requires an alias to be locked by the alias.
        const selectList = cols
          .map((c) => (c === 'id' ? `${q(mapName)}.new_id` : `${q(table)}.${q(c)}`))
          .join(', ');
        [copyResult] = await conn.query(
          `INSERT INTO ${q(tmpName)} (${cols.map(q).join(', ')})
           SELECT ${selectList} FROM ${q(table)} JOIN ${q(mapName)} ON ${q(mapName)}.old_id = ${q(table)}.id`
        );
      } finally {
        await conn.query('UNLOCK TABLES');
      }
      console.log(`  ${table}: copied ${copyResult.affectedRows} row(s) into ${tmpName}, ${idChanges} id(s) changed`);
      await conn.query(`ALTER TABLE ${q(tmpName)} AUTO_INCREMENT = ${rowCount + 1}`);
    } else {
      await conn.query(`LOCK TABLES ${q(table)} READ, ${q(tmpName)} WRITE`);
      try {
        const orderClause = reorderBy ? ` ORDER BY ${reorderBy}` : '';
        [copyResult] = await conn.query(
          `INSERT INTO ${q(tmpName)} (${cols.map(q).join(', ')}) SELECT ${cols.map(q).join(', ')} FROM ${q(table)}${orderClause}`
        );
      } finally {
        await conn.query('UNLOCK TABLES');
      }
      console.log(`  ${table}: copied ${copyResult.affectedRows} row(s) into ${tmpName}`);
      if (sourceAutoIncrement != null) {
        await conn.query(`ALTER TABLE ${q(tmpName)} AUTO_INCREMENT = ${Number(sourceAutoIncrement)}`);
      }
    }

    // FK checks stay off for the swap, the remap and the FK surgery after it.
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // Atomic swap: `table` always resolves to a real table, old or new.
    await conn.query(`RENAME TABLE ${q(table)} TO ${q(oldName)}, ${q(tmpName)} TO ${q(table)}`);
    swapped = true;
    console.log(`  ${table}: swapped in rebuilt table`);

    // Undo the swap (original table goes back live) — used if anything below,
    // before the FK surgery, goes wrong. Foreign keys still point at the old
    // table at this stage, so nothing else needs undoing.
    const unswap = async () => {
      await conn.query(`RENAME TABLE ${q(table)} TO ${q(tmpName)}, ${q(oldName)} TO ${q(table)}`);
      swapped = false;
      await conn.query(`DROP TABLE IF EXISTS ${q(tmpName)}`);
      await conn.query(`DROP TABLE IF EXISTS ${q(mapName)}`);
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    };

    const [[after]] = await conn.query(`SELECT COUNT(*) AS n FROM ${q(table)}`);
    const [[oldNow]] = await conn.query(`SELECT COUNT(*) AS n FROM ${q(oldName)}`);
    if (Number(after.n) !== Number(oldNow.n)) {
      await unswap();
      throw new Error(
        `row count mismatch after swap (rebuilt=${after.n}, original=${oldNow.n}) — a write landed during the ` +
        `rebuild. The swap was undone and the original table is live again. Re-run when the app is quiet.`
      );
    }

    // --- Remap every reference to the renumbered ids, all-or-nothing ---
    // Two passes per column so unique keys (doctor_patients) can't collide
    // part-way: first shift mapped values above every existing value
    // (value = new_id + OFFSET), then subtract OFFSET.
    if (doRenumber && idChanges > 0 && refs.length > 0) {
      try {
        await conn.query('START TRANSACTION');
        for (const r of refs) {
          const child = qt(r.schema, r.table);
          const [[mx]] = await conn.query(`SELECT MAX(${q(r.column)}) AS hi FROM ${child}`);
          const offset = Math.max(maxOld, Number(mx.hi || 0)) + 1;
          if (offset + rowCount > MAX_SAFE_ID) {
            throw new Error(`ids too large to remap safely in ${r.schema}.${r.table}.${r.column}`);
          }
          const [p1] = await conn.query(
            `UPDATE ${child} JOIN ${qt(dbName, mapName)} ON ${child}.${q(r.column)} = ${qt(dbName, mapName)}.old_id
                SET ${child}.${q(r.column)} = ${qt(dbName, mapName)}.new_id + ${offset}`
          );
          await conn.query(`UPDATE ${child} SET ${q(r.column)} = ${q(r.column)} - ${offset} WHERE ${q(r.column)} >= ${offset}`);
          console.log(`  ${table}: remapped ${r.schema}.${r.table}.${r.column} (${p1.affectedRows} row(s))`);
        }
        await conn.query('COMMIT');
      } catch (e) {
        try { await conn.query('ROLLBACK'); } catch (_) { /* nothing to roll back */ }
        await unswap();
        throw new Error(`could not remap references, everything rolled back and the original table is live again: ${e.message}`);
      }
    }

    // --- Recreate this table's own outgoing constraints ---
    // CREATE TABLE ... LIKE never copied them. The old table still holds
    // constraints under these names (unique per schema), so each is dropped
    // from the old table first. Auto-named constraints (`<table>_ibfk_N`) are
    // renamed along with the table, so look up the old one by what it references.
    const [oldNowFKs] = await conn.query(
      `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [dbName, oldName]
    );
    for (const fk of outgoingFKs) {
      const onOld = oldNowFKs.find((o) =>
        o.COLUMN_NAME === fk.COLUMN_NAME &&
        o.REFERENCED_TABLE_NAME === fk.REFERENCED_TABLE_NAME &&
        o.REFERENCED_COLUMN_NAME === fk.REFERENCED_COLUMN_NAME);
      if (onOld) {
        await conn.query(`ALTER TABLE ${q(oldName)} DROP FOREIGN KEY ${q(onOld.CONSTRAINT_NAME)}`);
      }
      const rc = outgoingRC.find((r) => r.CONSTRAINT_NAME === fk.CONSTRAINT_NAME);
      const onDelete = rc ? ` ON DELETE ${rc.DELETE_RULE}` : '';
      const onUpdate = rc ? ` ON UPDATE ${rc.UPDATE_RULE}` : '';
      await conn.query(
        `ALTER TABLE ${q(table)} ADD CONSTRAINT ${q(fk.CONSTRAINT_NAME)} ` +
        `FOREIGN KEY (${q(fk.COLUMN_NAME)}) REFERENCES ${q(fk.REFERENCED_TABLE_NAME)}(${q(fk.REFERENCED_COLUMN_NAME)})${onDelete}${onUpdate}`
      );
      console.log(`  ${table}: recreated outgoing constraint ${fk.CONSTRAINT_NAME} → ${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME})`);
    }

    // Redirect every dependent table's incoming constraint off the old table,
    // which is about to be dropped (otherwise every later insert into the
    // dependent table fails permanently).
    for (const fk of incomingFKs) {
      const rc = incomingRC.find((r) =>
        r.CONSTRAINT_NAME === fk.CONSTRAINT_NAME && r.TABLE_NAME === fk.TABLE_NAME && r.CONSTRAINT_SCHEMA === fk.TABLE_SCHEMA);
      const onDelete = rc ? ` ON DELETE ${rc.DELETE_RULE}` : '';
      const onUpdate = rc ? ` ON UPDATE ${rc.UPDATE_RULE}` : '';
      const child = qt(fk.TABLE_SCHEMA, fk.TABLE_NAME);
      await conn.query(`ALTER TABLE ${child} DROP FOREIGN KEY ${q(fk.CONSTRAINT_NAME)}`);
      await conn.query(
        `ALTER TABLE ${child} ADD CONSTRAINT ${q(fk.CONSTRAINT_NAME)} ` +
        `FOREIGN KEY (${q(fk.COLUMN_NAME)}) REFERENCES ${qt(dbName, table)}(${q(fk.REFERENCED_COLUMN_NAME)})${onDelete}${onUpdate}`
      );
      console.log(`  ${table}: redirected ${fk.TABLE_NAME}.${fk.CONSTRAINT_NAME} to point at the rebuilt ${table}`);
    }

    // Only now is it safe to drop the old table and the scratch map.
    await conn.query(`DROP TABLE ${q(oldName)}`);
    await conn.query(`DROP TABLE IF EXISTS ${q(mapName)}`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    if (doRenumber) {
      console.log(rowCount === 0
        ? `  ${table}: rebuild complete — table is empty, next id 1`
        : `  ${table}: rebuild complete — ids now 1..${rowCount}, next id ${rowCount + 1}, FKs preserved`);
    } else {
      console.log(`  ${table}: rebuild complete (${after.n} row(s), ids, AUTO_INCREMENT & FKs preserved)`);
    }

    return {
      before: rowCount,
      after: Number(after.n),
      renumbered: doRenumber,
      idsChanged: idChanges,
      referencesRemapped: doRenumber && idChanges > 0 ? refs.map((r) => `${r.schema}.${r.table}.${r.column}`) : [],
      autoIncrement: doRenumber ? rowCount + 1 : sourceAutoIncrement,
      outgoingFksRecreated: outgoingFKs.map((f) => f.CONSTRAINT_NAME),
      incomingFksRedirected: incomingFKs.map((f) => `${f.TABLE_NAME}.${f.CONSTRAINT_NAME}`),
    };
  } catch (e) {
    // Before the swap, only scratch tables exist: clean them up so the next
    // run starts fresh. After a swap that couldn't be undone, leave everything
    // (including `_rebuild_old`) for a human.
    if (!swapped) {
      try {
        await conn.query('UNLOCK TABLES');
        await conn.query(`DROP TABLE IF EXISTS ${q(tmpName)}`);
        await conn.query(`DROP TABLE IF EXISTS ${q(mapName)}`);
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      } catch (_) { /* best effort */ }
    }
    throw e;
  } finally {
    conn.release();
    await promisePool.end();
  }
}

if (require.main === module) {
  (async () => {
    try {
      const args = parseArgs(process.argv.slice(2));
      await rebuildTable(args);
      process.exit(0);
    } catch (e) {
      console.error('rebuildTable failed:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = rebuildTable;
