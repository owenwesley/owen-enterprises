// Users live in the owenenterprises gateway database
//
// insertUser, updateUser, and deleteUserById used to live here: all three
// were unused by every route (routes/auth.js does inserts via
// insertUserWithRole and profile edits via updateUserProfile /
// updateUserProfileWithPassword; nothing deletes a user by id). insertUser
// also built its SQL by string interpolation rather than placeholders — a
// landmine if anything had ever imported it. Removed outright rather than
// left importable, same reasoning as the copy*Table cleanup (1.10.1) and
// insertNutritionsLite removal (1.10.2).
//
// Parameterised. role/doctorStatus are set by the server, never taken from
// the client as-is.
const insertUserWithRole =
  `INSERT INTO users (firstName, lastName, userName, password, email, role, doctorStatus)
   VALUES (?,?,?,?,?,?,?)`;
const insertDoctorProfile =
  `INSERT INTO doctor_profiles (user_id, licenseNumber, specialty, inviteCode) VALUES (?,?,?,?)`;

const selectUser = 'SELECT * FROM users';

// Profile edits (routes/auth.js → PUT /auth/profile). Parameterised, and the
// password column is only touched when a new password is actually supplied.
const updateUserProfile =
  `UPDATE users SET firstName=?, lastName=?, userName=?, email=? WHERE id=?`;
const updateUserProfileWithPassword =
  `UPDATE users SET firstName=?, lastName=?, userName=?, email=?, password=? WHERE id=?`;

module.exports = {
  insertUserWithRole, insertDoctorProfile, selectUser,
  updateUserProfile, updateUserProfileWithPassword,
};
