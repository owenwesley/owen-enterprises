const insertFeaturePreference =
  `INSERT INTO feature_preferences (user_id, chkBgtracker, chkCommunityLibrary, chkMeetings)
   VALUES (?, ?, ?, ?)`;

const selectFeaturePreference =
  `SELECT * FROM feature_preferences WHERE user_id=?`;

const updateFeaturePreference =
  `UPDATE feature_preferences
   SET chkBgtracker=?, chkCommunityLibrary=?, chkMeetings=?
   WHERE user_id=?`;

const upsertFeaturePreference =
  `INSERT INTO feature_preferences (user_id, chkBgtracker, chkCommunityLibrary, chkMeetings)
   VALUES (?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE
     chkBgtracker=VALUES(chkBgtracker),
     chkCommunityLibrary=VALUES(chkCommunityLibrary),
     chkMeetings=VALUES(chkMeetings)`;

module.exports = {
  insertFeaturePreference,
  selectFeaturePreference,
  updateFeaturePreference,
  upsertFeaturePreference,
};
