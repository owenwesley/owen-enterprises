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

const FIELDS = ['chkBgtracker', 'chkCommunityLibrary', 'chkMeetings', 'chkChurch'];

// GET /owenenterprises/features/:user_id
// Returns which features are enabled for this user, plus featuresChosen (0 = a new
// account that has not saved Feature access yet; the client sends it there once).
// Auto-creates a row with the signup defaults (utils/featureDefaults.js) if none exists yet.
router.get('/:user_id', async (req, res) => {
  const user_id = req.params.user_id;
  try {
    const [results] = await owenenterprises.promise().query(selectFeaturePreference, [user_id]);

    if (results && results.length > 0) {
      return res.json({ results: results[0] });
    }

    // No row yet (signup normally creates it) — create it with the same defaults
    // signup uses: everything off and not yet chosen for an ordinary account.
    const [u] = await owenenterprises.promise().query('SELECT role FROM users WHERE id=?', [user_id]);
    const f = defaultFeaturePrefs(u && u[0] ? u[0].role : 'patient');
    await owenenterprises.promise().query(
      upsertFeaturePreference,
      [user_id, f.chkBgtracker, f.chkCommunityLibrary, f.chkMeetings, f.chkChurch, f.featuresChosen]
    );
    return res.json({ results: { user_id, ...f } });
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /owenenterprises/features/edit/:user_id
// A field the request does not carry keeps its stored value (an older page still open in
// a browser must not switch Church off, and a partial save must never switch BG Tracker
// ON). With no stored row a missing field is 0. Every save marks featuresChosen = 1, so
// "Save" and "Skip for now" on the first-sign-in screen both end the prompt.
router.post('/edit/:user_id', async (req, res) => {
  try {
    const [rows] = await owenenterprises.promise().query(selectFeaturePreference, [req.params.user_id]);
    const stored = rows && rows[0] ? rows[0] : {};
    const v = {};
    for (const k of FIELDS) {
      v[k] = req.body[k] === undefined ? toBit(stored[k]) : toBit(req.body[k]);
    }
    await owenenterprises.promise().query(
      upsertFeaturePreference,
      [req.params.user_id, v.chkBgtracker, v.chkCommunityLibrary, v.chkMeetings, v.chkChurch, 1]
    );
    return res.json({ message: 'Feature preferences updated' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
