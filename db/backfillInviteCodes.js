/**
 * db/backfillInviteCodes.js
 *
 * Runs at every start-up, after init() has created/altered tables. New doctor
 * signups get an inviteCode immediately (routes/auth.js). This only covers
 * doctor_profiles rows that predate the inviteCode column — it fills in a
 * code for any row where it's still NULL. Idempotent: once every row has a
 * code, this is one cheap SELECT.
 */
const crypto = require('crypto');
const { owenenterprises: db } = require('./db');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids look-alike codes
const CODE_LENGTH = 8;

function genCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

async function backfillInviteCodes() {
  try {
    const conn = db.promise();
    const [rows] = await conn.query(
      'SELECT user_id FROM doctor_profiles WHERE inviteCode IS NULL'
    );
    if (rows.length === 0) return;

    let filled = 0;
    for (const { user_id } of rows) {
      // Retry on the rare collision rather than fail the whole batch.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await conn.query(
            'UPDATE doctor_profiles SET inviteCode = ? WHERE user_id = ?',
            [genCode(), user_id]
          );
          filled++;
          break;
        } catch (e) {
          if (e.code !== 'ER_DUP_ENTRY') throw e;
        }
      }
    }
    if (filled) console.log(`  ✓  doctor_profiles: generated invite codes for ${filled} account(s)`);
  } catch (e) {
    console.error('  ✗  backfillInviteCodes failed:', e.message);
  }
}

module.exports = backfillInviteCodes;
module.exports.genCode = genCode;
