/**
 * db/maintenance/idRefs.js
 *
 * Shared helpers for cleanOrphans.js and deleteUser.js: find every column, in
 * every one of the five databases, that stores a `users` or `clinics` id as a
 * plain number.
 *
 * This is the same list rebuildTable.js uses (its ID_REFERENCES constant). If a
 * new table ever stores another table's id as a bare column with a new column
 * name, add the name here AND in rebuildTable.js.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), quiet: true });
const mysql = require('mysql2');
const { dbNames } = require('../init');

const USER_COLS   = ['user_id', 'doctor_id', 'patient_id', 'requester_id'];
const CLINIC_COLS = ['clinic_id', 'requestedClinicId'];

const q  = (name) => `\`${name}\``;
const qt = (schema, name) => `${q(schema)}.${q(name)}`;

function makePool() {
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    port: Number(process.env.DB_PORT) || 3306,
    database: dbNames().gateway,
  }).promise();
}

/** [{ schema, table, column, engine }] for every base table with one of `cols`. */
async function findRefColumns(conn, cols) {
  const [rows] = await conn.query(
    `SELECT c.TABLE_SCHEMA AS s, c.TABLE_NAME AS t, c.COLUMN_NAME AS col, tb.ENGINE AS engine
       FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES tb
         ON tb.TABLE_SCHEMA = c.TABLE_SCHEMA AND tb.TABLE_NAME = c.TABLE_NAME
      WHERE tb.TABLE_TYPE = 'BASE TABLE'
        AND c.TABLE_SCHEMA IN (?)
        AND c.COLUMN_NAME IN (?)
        AND c.TABLE_NAME NOT LIKE '%\\_rebuild\\_%'
      ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.COLUMN_NAME`,
    [Object.values(dbNames()), cols]
  );
  return rows.map((r) => ({ schema: r.s, table: r.t, column: r.col, engine: String(r.engine || '') }));
}

const isInnoDB = (r) => r.engine.toLowerCase() === 'innodb';

module.exports = { USER_COLS, CLINIC_COLS, q, qt, makePool, findRefColumns, isInnoDB, dbNames };
