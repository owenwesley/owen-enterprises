/**
 * utils/borrower.js
 *
 * Shared "who has it" rule for books and movies. Out needs a real borrower;
 * In always reads "In Library". Returns an error string, or null when fine.
 * `what` is only used in the message ("this book", "film 2", ...).
 */
const IN_LIBRARY = 'In Library';

function checkWho(ioVal, who, what = 'this item') {
  const w = (who || '').trim();
  if (ioVal === 0 && (w === '' || w === IN_LIBRARY)) return `Choose who has ${what}.`;
  return null;
}

/** The value to store in `who`: "In Library" when In, else the trimmed borrower. */
function whoToDb(ioVal, who) {
  return ioVal === 1 ? IN_LIBRARY : (who || '').trim();
}

module.exports = { IN_LIBRARY, checkWho, whoToDb };
