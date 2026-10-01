/**
 * utils/collectionFormat.js
 *
 * Classifies a movie entry by how many individual films it contains.
 * The backend is the single source of truth for this label — it is
 * always recomputed from the actual array length, never trusted from
 * client input, so a user cannot submit 2 movies and claim "BoxSet".
 */

const MAX_MOVIES = 12;

const FORMAT_SLUGS = {
  Single:            'single',
  'Double Feature':  'double-feature',
  'Triple Feature':  'triple-feature',
  'Quadruple Feature': 'quadruple-feature',
  BoxSet:            'boxset',
};

function classifyCollection(count) {
  const n = Number(count);

  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`Invalid movie count: ${count}. Must be a positive integer.`);
  }
  if (n > MAX_MOVIES) {
    throw new RangeError(`Movie count ${n} exceeds the maximum of ${MAX_MOVIES} per collection.`);
  }

  let label;
  if (n === 1)      label = 'Single';
  else if (n === 2) label = 'Double Feature';
  else if (n === 3) label = 'Triple Feature';
  else if (n === 4) label = 'Quadruple Feature';
  else              label = 'BoxSet';

  return { label, slug: FORMAT_SLUGS[label], count: n };
}

function classifyCollectionOrDefault(count) {
  const n = Number(count);

  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`Invalid movie count: ${count}. Must be a positive integer.`);
  }
  if (n > MAX_MOVIES) {
    return { label: 'BoxSet Mega Bundle', slug: 'boxset-mega-bundle', count: n };
  }
  return classifyCollection(n);
}

module.exports = { classifyCollection, classifyCollectionOrDefault, MAX_MOVIES, FORMAT_SLUGS };
