const express = require('express');
const { toBit } = require('../../utils/coerce');
const { owenenterprises } = require('../../db/db');
const {
  selectFeaturePreference,
  upsertFeaturePreference,
} = require('../../db/sql/owenenterprises/featurePreferences');
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
    await owenenterprises.promise().query(upsertFeaturePreference, [user_id, 1, 1, 1]);
    return res.json({
      results: { user_id, chkBgtracker: 1, chkCommunityLibrary: 1, chkMeetings: 1 },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /owenenterprises/features/edit/:user_id
router.post('/edit/:user_id', async (req, res) => {
  const { chkBgtracker = 1, chkCommunityLibrary = 1, chkMeetings = 1 } = req.body;
  try {
    await owenenterprises.promise().query(
      upsertFeaturePreference,
      [req.params.user_id, toBit(chkBgtracker), toBit(chkCommunityLibrary), toBit(chkMeetings)]
    );
    return res.json({ message: 'Feature preferences updated' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
