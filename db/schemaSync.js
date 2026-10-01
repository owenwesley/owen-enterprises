/**
 * db/schemaSync.js
 *
 * Brings an EXISTING table up to date with its CREATE TABLE definition in
 * db/init.js. `CREATE TABLE IF NOT EXISTS` does nothing when the table is
 * already there, so a column added to a definition later would never reach a
 * database created earlier. init.js calls syncColumns() for every table that
 * already exists:
 *
 *   table missing            → created from the definition   (init.js)
 *   table present, column(s) missing → ALTER TABLE ... ADD COLUMN  (here)
 *   table present, all columns there → nothing happens
 *
 * Scope, on purpose: it only ADDS missing columns. It never drops, renames or
 * re-types a column, and never touches data — existing rows just get the new
 * column's default. Indexes / foreign keys in a definition are only applied
 * when the table is first created.
 */

const CONSTRAINT_RE = /^(PRIMARY|FOREIGN|UNIQUE|KEY|INDEX|CONSTRAINT|CHECK|FULLTEXT|SPATIAL)\b/i;

/** Split on commas that are not inside (...) or a quoted string. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      cur += ch;
      if (ch === '\\') { cur += body[++i] || ''; continue; }
      if (ch === quote) {
        if (body[i + 1] === quote) { cur += body[++i]; continue; } // '' inside a string
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Column list from a CREATE TABLE statement: [{ name, ddl }] where ddl is the
 * column definition without its name (e.g. "INT NOT NULL DEFAULT 0").
 */
function parseColumns(createSql) {
  const open = createSql.indexOf('(');
  if (open === -1) return [];
  // Find the ')' that closes the column list (skip quotes so a ')' in a default can't fool us).
  let depth = 0, quote = null, close = -1;
  for (let i = open; i < createSql.length; i++) {
    const ch = createSql[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') { depth--; if (depth === 0) { close = i; break; } }
  }
  if (close === -1) return [];

  const cols = [];
  for (const piece of splitTopLevel(createSql.slice(open + 1, close))) {
    if (CONSTRAINT_RE.test(piece)) continue;
    const m = piece.match(/^`?([A-Za-z0-9_]+)`?\s+([\s\S]+)$/);
    if (m) cols.push({ name: m[1], ddl: m[2].replace(/\s+/g, ' ').trim() });
  }
  return cols;
}

/**
 * Add any columns that `createSql` defines but `table` lacks.
 * Never throws — a failure is logged and start-up carries on.
 */
async function syncColumns(conn, dbName, table, createSql) {
  try {
    const wanted = parseColumns(createSql);
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [dbName, table]
    );
    const have = new Set(rows.map((r) => r.COLUMN_NAME.toLowerCase())); // MySQL column names are case-insensitive
    const missing = wanted.filter((c) => !have.has(c.name.toLowerCase()));
    if (missing.length === 0) return { added: [], failed: [] };

    // A column that is itself the primary key can't be bolted onto a table
    // that already has data/keys — leave it alone and say so.
    const addable = [];
    const failed = [];
    for (const c of missing) {
      if (/\bPRIMARY\s+KEY\b/i.test(c.ddl)) {
        failed.push({ name: c.name, reason: 'primary-key column cannot be added automatically' });
      } else {
        addable.push(c);
      }
    }

    const added = [];
    if (addable.length) {
      const clauses = addable.map((c) => `ADD COLUMN \`${c.name}\` ${c.ddl}`);
      try {
        await conn.query(`ALTER TABLE \`${dbName}\`.\`${table}\` ${clauses.join(', ')}`);
        added.push(...addable.map((c) => c.name));
      } catch {
        // One bad column shouldn't block the rest: retry individually.
        for (const c of addable) {
          try {
            await conn.query(`ALTER TABLE \`${dbName}\`.\`${table}\` ADD COLUMN \`${c.name}\` ${c.ddl}`);
            added.push(c.name);
          } catch (e) {
            failed.push({ name: c.name, reason: e.message });
          }
        }
      }
    }

    if (added.length) console.log(`  +  ${table}: added column(s) ${added.join(', ')}`);
    for (const f of failed) console.error(`  ✗  ${table}.${f.name}: ${f.reason}`);
    return { added, failed };
  } catch (e) {
    console.error(`  ✗  ${table}: column check failed:`, e.message);
    return { added: [], failed: [] };
  }
}

/** Parses the quoted values out of an `ENUM('a','b','c')` definition, unescaping '' → '. */
function parseEnumValues(ddl) {
  const m = ddl.match(/^ENUM\s*\(([\s\S]*)\)/i);
  if (!m) return null;
  const values = [];
  let cur = '', inStr = false;
  const body = m[1];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (!inStr) {
      if (ch === "'") inStr = true;
      continue;
    }
    if (ch === "'") {
      if (body[i + 1] === "'") { cur += "'"; i++; continue; } // '' → '
      inStr = false;
      values.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  return values;
}

/**
 * Widen an ENUM column to include any values the definition adds, without
 * removing any value already in the live column (existing rows may use them).
 * Only touches columns whose ddl starts with ENUM(...); never shrinks, never
 * reorders existing values, only appends new ones at the end.
 */
async function syncEnums(conn, dbName, table, createSql) {
  try {
    const wanted = parseColumns(createSql).filter((c) => /^ENUM\s*\(/i.test(c.ddl));
    if (wanted.length === 0) return { widened: [] };

    const [rows] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [dbName, table]
    );
    const byName = new Map(rows.map((r) => [r.COLUMN_NAME.toLowerCase(), r]));

    const widened = [];
    for (const col of wanted) {
      const live = byName.get(col.name.toLowerCase());
      if (!live) continue; // handled by syncColumns (column doesn't exist yet)
      const liveValues = parseEnumValues(live.COLUMN_TYPE);
      const wantedValues = parseEnumValues(col.ddl);
      if (!liveValues || !wantedValues) continue;

      const missing = wantedValues.filter((v) => !liveValues.includes(v));
      if (missing.length === 0) continue;

      const union = [...liveValues, ...missing];
      const enumList = union.map((v) => `'${v.replace(/'/g, "''")}'`).join(',');
      // Keep the column's own current NULL-ability/default rather than the
      // definition's — widening should never change either, just add values.
      const nullability = live.IS_NULLABLE === 'NO' ? 'NOT NULL' : 'NULL';
      // MariaDB returns COLUMN_DEFAULT already wrapped in quotes (e.g. "'patient'");
      // MySQL returns it unwrapped (e.g. "patient"). Strip any wrapping quotes
      // before re-quoting so the value isn't double-quoted on MariaDB.
      let rawDefault = live.COLUMN_DEFAULT;
      if (rawDefault !== null) {
        const m = String(rawDefault).match(/^'([\s\S]*)'$/);
        if (m) rawDefault = m[1].replace(/''/g, "'");
      }
      const dflt = rawDefault === null ? '' : ` DEFAULT '${String(rawDefault).replace(/'/g, "''")}'`;
      await conn.query(
        `ALTER TABLE \`${dbName}\`.\`${table}\` MODIFY COLUMN \`${col.name}\` ENUM(${enumList}) ${nullability}${dflt}`
      );
      widened.push({ name: col.name, added: missing });
    }
    if (widened.length) {
      console.log(`  ~  ${table}: widened ${widened.map((w) => `${w.name} (+${w.added.join(', ')})`).join(', ')}`);
    }
    return { widened };
  } catch (e) {
    console.error(`  ✗  ${table}: enum widen check failed:`, e.message);
    return { widened: [] };
  }
}

module.exports = { syncColumns, syncEnums, parseColumns, parseEnumValues, splitTopLevel };
