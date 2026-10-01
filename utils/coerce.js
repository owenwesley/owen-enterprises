/**
 * utils/coerce.js
 *
 * Coercion helpers for values arriving from the client. The frontend is not
 * consistent about how it sends booleans and numbers (a real checkbox boolean,
 * 0/1 straight from the DB, or the strings "1"/"0"/"true"/"false"), and JS
 * treats the string "0" as truthy — so `b.flag ? 1 : 0` silently turns
 * "0" into 1. Everything that reaches a tinyint(1) or numeric column goes
 * through these instead.
 */

/** Any "false-ish" value → 0, anything else → 1. "0", "false", "" and "no" are 0. */
function toBit(v) {
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return (s === '' || s === '0' || s === 'false' || s === 'no' || s === 'off' || s === 'null' || s === 'undefined') ? 0 : 1;
  }
  return v ? 1 : 0;
}

/** Library "In/Out" → tinyint. 1 = In (the default), 0 = Out. Accepts 'Out', 0, '0', false. */
function ioToDb(v) {
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return (s === 'out' || s === '0' || s === 'false') ? 0 : 1;
  }
  return (v === 0 || v === false) ? 0 : 1;
}

/** Library "Lost?" → tinyint. 1 = Lost, 0 = not (the default). Accepts 'Yes', 1, '1', true. */
function lostToDb(v) {
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return (s === 'yes' || s === '1' || s === 'true') ? 1 : 0;
  }
  return (v === 1 || v === true) ? 1 : 0;
}

/** A finite number, or `fallback` for '', null, NaN, Infinity, junk. */
function toNum(v, fallback = 0) {
  const n = (typeof v === 'string' && v.trim() === '') ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** A string, or `fallback` for null/undefined. Numbers/booleans are stringified; '' is kept as ''. */
function toStr(v, fallback = '') {
  return (v === undefined || v === null) ? fallback : String(v);
}

module.exports = { toBit, ioToDb, lostToDb, toNum, toStr };
