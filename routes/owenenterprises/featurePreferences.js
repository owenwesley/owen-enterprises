const express = require('express');
const { toBit } = require('../../utils/coerce');
const { owenenterprises } = require('../../db/db');
const {
  selectFeaturePreference,
  upsertFeaturePreference,
} = require('../../db/sql/owenenterprises/featurePreferences');
const { serverError } = require('../../utils/serverError');
const { defaultFeaturePrefs } = require('../../utils/featureDefaults');
const router = express.Router();

// GET /owenenterprises/features/:user_id
// Returns which features are enabled for this user.
// Auto-creates a row with the signup defaults (utils/featureDefaults.js) if none exists yet.
router.get('/:user_id', async (req, res) => {
  const user_id = req.params.user_id;
  try {
    const [results] = await owenenterprises.promise().query(selectFeaturePreference, [user_id]);

    if (results && results.length > 0) {
      return res.json({ results: results[0] });
    }

    // No row yet (signup normally creates it) — create it with the same defaults
    // signup uses: BG Tracker off for an ordinary account, on for a doctor.
    const [u] = await owenenterprises.promise().query('SELECT role FROM users WHERE id=?', [user_id]);
    const f = defaultFeaturePrefs(u && u[0] ? u[0].role : 'patient');
    await owenenterprises.promise().query(
      upsertFeaturePreference,
      [user_id, f.chkBgtracker, f.chkCommunityLibrary, f.chkMeetings, f.chkChurch]
    );
    return res.json({ results: { user_id, ...f } });
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /owenenterprises/features/edit/:user_id
// chkChurch is only changed when the request carries it: a client that saves
// without it (an older page still open in a browser) must not switch Church off.
router.post('/edit/:user_id', async (req, res) => {
  const { chkBgtracker = 1, chkCommunityLibrary = 1, chkMeetings = 1, chkChurch } = req.body;
  try {
    let church;
    if (chkChurch === undefined) {
      const [rows] = await owenenterprises.promise().query(selectFeaturePreference, [req.params.user_id]);
      church = rows && rows[0] ? toBit(rows[0].chkChurch) : 0;
    } else {
      church = toBit(chkChurch);
    }
    await owenenterprises.promise().query(
      upsertFeaturePreference,
      [req.params.user_id, toBit(chkBgtracker), toBit(chkCommunityLibrary), toBit(chkMeetings), church]
    );
    return res.json({ message: 'Feature preferences updated' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
