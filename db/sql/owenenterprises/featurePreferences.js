const insertFeaturePreference =
  `INSERT INTO feature_preferences (user_id, chkBgtracker, chkCommunityLibrary, chkMeetings, chkChurch, featuresChosen)
   VALUES (?, ?, ?, ?, ?, ?)`;

const selectFeaturePreference =
  `SELECT * FROM feature_preferences WHERE user_id=?`;

const updateFeaturePreference =
  `UPDATE feature_preferences
   SET chkBgtracker=?, chkCommunityLibrary=?, chkMeetings=?, chkChurch=?, featuresChosen=?
   WHERE user_id=?`;

const upsertFeaturePreference =
  `INSERT INTO feature_preferences (user_id, chkBgtracker, chkCommunityLibrary, chkMeetings, chkChurch, featuresChosen)
   VALUES (?, ?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE
     chkBgtracker=VALUES(chkBgtracker),
     chkCommunityLibrary=VALUES(chkCommunityLibrary),
     chkMeetings=VALUES(chkMeetings),
     chkChurch=VALUES(chkChurch),
     featuresChosen=VALUES(featuresChosen)`;

module.exports = {
  insertFeaturePreference,
  selectFeaturePreference,
  updateFeaturePreference,
  upsertFeaturePreference,
};
