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

// Feature type <-> film count. The server decides these so a row can never
// say "Single" with 7 films, or "Double Feature" with 1.
const TYPE_COUNTS = { 'Double Feature': 2, 'Triple Feature': 3, 'Quadruple Feature': 4 };
const TYPE_NAMES  = { 2: 'Double Feature', 3: 'Triple Feature', 4: 'Quadruple Feature' };

/** Returns { numMovie (1-12), featureMedia ('' | Double..Box Set) } for a body. */
function normalizeCollection(b) {
  let n = Math.trunc(Number(b.numMovie)) || 1;
  if (n <= 1 && TYPE_COUNTS[b.featureMedia]) n = TYPE_COUNTS[b.featureMedia];
  if (n <= 1 && b.featureMedia === 'Box Set') n = 5;
  n = Math.min(12, Math.max(1, n));
  const featureMedia = n === 1 ? '' : (TYPE_NAMES[n] || 'Box Set');
  return { numMovie: n, featureMedia };
}

/** Out needs a real borrower; In always reads "In Library". Returns error text or null. */
function checkWho(ioVal, who) {
  const w = (who || '').trim();
  if (ioVal === 0 && (w === '' || w === 'In Library')) return 'Choose who has this movie.';
  return null;
}

module.exports = { slotFields, normalizeCollection, checkWho };
