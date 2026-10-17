#!/usr/bin/env node
/**
 * tests/schema-parse.js (npm run check:schema) - 1.13.11. No server, no database.
 * db/schemaSync.js adds a missing column to an EXISTING table by parsing the CREATE TABLE text. A SQL comment
 * inside a definition makes it read the wrong column name and silently skip the real column (that is how
 * featuresChosen was never added in the first 1.13.11 build). This checks every definition.
 */
const fs = require('fs'), path = require('path');
const { parseColumns } = require('../db/schemaSync');
const root = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

for (const f of ['db/init.js', 'db/db.js']) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  const defs = src.match(/CREATE TABLE IF NOT EXISTS [\s\S]*?ENGINE=InnoDB[^`]*/g) || [];
  ok(defs.length > 10, `${f}: found the table definitions (${defs.length})`);
  for (const d of defs) {
    const name = (d.match(/CREATE TABLE IF NOT EXISTS (\w+)/) || [])[1];
    ok(!/(^|\n)\s*--|\/\*/.test(d), `${f}: ${name} has no SQL comment inside its definition (schemaSync cannot read it)`);
    const cols = parseColumns(d).map((c) => c.name);
    ok(cols.length > 0 && cols.every((c) => /^\w+$/.test(c)), `${f}: ${name} columns parse to plain names: ${cols.join(',')}`);
    if (name === 'feature_preferences') ok(cols.includes('featuresChosen'), `${f}: feature_preferences includes featuresChosen`);
  }
}
console.log(`schema-parse: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
