// Shared helper: extracts the 12-slot movie fields from a request body
// in the exact left-to-right order the SQL statements expect.
function slotFields(b) {
  const out = [];
  for (let i = 1; i <= 12; i++) {
    out.push(
      b[`name${i}`]   || '',
      b[`rated${i}`]  || 'NR',
      b[`length${i}`] || 0,
      b[`yearR${i}`]  || 0,
      b[`media${i}`]  || 'DVD',
    );
  }
  return out;
}

module.exports = { slotFields };
