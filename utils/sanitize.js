/**
 * sanitize.js
 *
 * Converts arbitrary user-entered titles/names into safe, URL-friendly
 * filename slugs: lowercased, special characters stripped, spaces
 * collapsed to single hyphens.
 *
 *   "The Lord of the Rings: Fellowship!" → "the-lord-of-the-rings-fellowship"
 *   "Alien™ Anthology (Box Set)"          → "alien-anthology-box-set"
 */
function sanitizeFilename(input) {
  if (!input) return 'untitled';

  return String(input)
    .toLowerCase()
    .trim()
    // Replace anything that's not a letter, number, space, or hyphen with a space
    .replace(/[^a-z0-9\s-]/g, ' ')
    // Collapse any run of whitespace/hyphens into a single hyphen
    .replace(/[\s-]+/g, '-')
    // Trim leading/trailing hyphens left over from stripped punctuation
    .replace(/^-+|-+$/g, '')
    || 'untitled'; // fallback if sanitizing wiped out everything
}

module.exports = { sanitizeFilename };
