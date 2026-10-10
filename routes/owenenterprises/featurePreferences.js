const express = require('express');
const { toBit } = require('../../utils/coerce');
const { owenenterprises } = require('../../db/db');
const {
  selectFeaturePreference,
  upsertFeaturePreference,
} = require('../../db/sql/owenenterprises/featurePreferences');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

// GET /owenenterprises/features/:user_id
// Returns which features are enabled for this user.
// Auto-creates a row with all features enabled (1) if none exists yet.
router.get('/:user_id', async (req, res) => {
  const user_id = req.params.user_id;
  try {
    const [results] = await owenenterprises.promise().query(selectFeaturePreference, [user_id]);

    if (results && results.length > 0) {
      return res.json({ results: results[0] });
    }

    // First-time user — create a row with all features enabled
    await owenenterprises.promise().query(upsertFeaturePreference, [user_id, 1, 1, 1, 0]);
    return res.json({
      results: { user_id, chkBgtracker: 1, chkCommunityLibrary: 1, chkMeetings: 1, chkChurch: 0 },
    });
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
