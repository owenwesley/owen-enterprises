// Shared by preferences/add and preferences/edit.
//
// A user has exactly ONE preferences row, but the table has no UNIQUE(user_id)
// and the two routes used to be separate INSERT / UPDATE-by-id calls. Result:
// clicking Save twice created duplicate rows, and an edit carrying a stale or
// missing id matched nothing and silently saved nothing.
//
// Both routes now "save my preferences": update this user's row if it exists
// (looked up by user_id, never trusting a client-supplied id), otherwise
// create it. Checkbox flags go through toBit() so "0" really means off.
//
// When the row already exists, only the fields the client actually SENT are
// changed — anything omitted keeps its stored value. (The Save button used to
// send 7 of the 22 fields; as a plain overwrite that would zero the rest.)

const { insertPreference, updatePreference } = require('../../../db/sql/bgtracker/preferences');
const { bgtracker } = require('../../../db/db');
const { toBit, toNum } = require('../../../utils/coerce');

// The 22 editable values, in the exact order both SQL statements expect.
function values(b) {
  return [
    toNum(b.timesPD),
    toBit(b.chkNutrition), toBit(b.chkWeight), toNum(b.height),
    toBit(b.chkMeds), toBit(b.chkMedsB), toBit(b.chkMedsL),
    toBit(b.chkMedsD), toBit(b.chkMedsBed), toBit(b.chkInsulin), toNum(b.typInsulin),
    toBit(b.chkBP), toBit(b.chkSlidingScale),
    toNum(b.slidingScale1), toNum(b.slidingScale2a), toNum(b.slidingScale2b),
    toNum(b.slidingScale3a), toNum(b.slidingScale3b), toNum(b.slidingScale4a),
    toNum(b.slidingScale4b), toNum(b.slidingScale5), toNum(b.carbRatio),
  ];
}

async function savePreference(user_id, body) {
  const [rows] = await bgtracker.promise().query(
    'SELECT * FROM preferences WHERE user_id=? ORDER BY id LIMIT 1',
    [user_id]
  );
  if (rows.length > 0) {
    const sent = {};
    Object.keys(body || {}).forEach((k) => { if (body[k] !== undefined) sent[k] = body[k]; });
    const merged = { ...rows[0], ...sent };
    return bgtracker.promise().query(updatePreference, [...values(merged), rows[0].id, user_id]);
  }
  return bgtracker.promise().query(insertPreference, [user_id, ...values(body || {})]);
}

module.exports = { savePreference };
