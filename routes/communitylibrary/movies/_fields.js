const { ioToDb } = require('../../../utils/coerce');
const { checkWho, whoToDb, IN_LIBRARY } = require('../../../utils/borrower');

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

/**
 * Builds everything a movie add/edit needs from a request body `b`:
 *   { error }  when an Out film has no real borrower, otherwise
 *   { name, featureMedia, numMovie, slotParams, io, who, lost-free fields }
 *
 * Film status rules:
 *  - Single (1 film): the disc-level io/who ARE the film's status.
 *  - Set: each film 1..numMovie has its own io/who/img. If the request carries
 *    no per-film io/who at all (an older client, or a sparse body), the
 *    disc-level io/who apply to every film.
 *  - Films above numMovie are reset to In / "In Library" / no picture.
 *  - The disc-level io/who are then DERIVED: In when no film is out; Out
 *    otherwise, with who = the one borrower, or "Several" when they differ.
 *
 * `perFilmSent` is true when the raw request body had any io<N>/who<N> key.
 */
function buildMovie(b, perFilmSent) {
  const col = normalizeCollection(b);
  const n = col.numMovie;
  const discIo = ioToDb(b.io);
  const slots = [];

  if (n === 1) {
    const err = checkWho(discIo, b.who, 'this movie');
    if (err) return { error: err };
  }

  for (let i = 1; i <= 12; i++) {
    let io = 1, who = IN_LIBRARY, img = '';
    if (n === 1) {
      if (i === 1) { io = discIo; who = whoToDb(discIo, b.who); }
    } else if (i <= n) {
      io  = perFilmSent ? ioToDb(b[`io${i}`]) : discIo;
      const rawWho = perFilmSent ? b[`who${i}`] : b.who;
      const err = checkWho(io, rawWho, `film ${i}`);
      if (err) return { error: err };
      who = whoToDb(io, rawWho);
      img = String(b[`img${i}`] || '');
    }
    slots.push({ io, who, img });
  }

  let io = 1, who = IN_LIBRARY;
  if (n === 1) {
    io = slots[0].io; who = slots[0].who;
  } else {
    const out = slots.slice(0, n).filter((s) => s.io === 0);
    if (out.length) {
      io = 0;
      const names = [...new Set(out.map((s) => s.who))];
      who = names.length === 1 ? names[0] : 'Several';
    }
  }

  // 12 x (name, rated, length, yearR, media, io, who, img) in table order.
  const slotParams = [];
  for (let i = 1; i <= 12; i++) {
    slotParams.push(
      b[`name${i}`]   || '',
      b[`rated${i}`]  || 'NR',
      b[`length${i}`] || 0,
      b[`yearR${i}`]  || 0,
      b[`media${i}`]  || 'DVD',
      slots[i - 1].io,
      slots[i - 1].who,
      slots[i - 1].img,
    );
  }
  return { error: null, ...col, slotParams, io, who };
}

/** True when the raw request body carried any per-film io<N>/who<N> field. */
function perFilmStatusSent(body) {
  return Object.keys(body || {}).some((k) => /^(io|who)\d+$/.test(k));
}

module.exports = { normalizeCollection, buildMovie, perFilmStatusSent, checkWho };
