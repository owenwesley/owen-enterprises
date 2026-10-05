const express        = require('express');
const bcrypt         = require('bcryptjs');
const jwt            = require('jsonwebtoken');
const { owenenterprises: db } = require('../db/db');
const {
  selectUser, insertUserWithRole, insertDoctorProfile,
  updateUserProfile, updateUserProfileWithPassword,
} = require('../db/sql/users');
const authMiddleware = require('../middleware/auth');
const { genCode: genInviteCode } = require('../db/backfillInviteCodes');
const deleteUser = require('../db/maintenance/deleteUser');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'owenenterprises_secret_change_in_prod';

// Promise wrapper around the callback pool.
const query = (sql, params) =>
  new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

// ── Helper: build a signed token ──────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    { id: user.id, userName: user.userName,
      firstName: user.firstName, lastName: user.lastName,
      role: user.role || 'patient' },
    SECRET,
    { expiresIn: '8h' }
  );
}

// ── POST /auth/signup — register a new user ───────────────────────────────────
// Body: { firstName, lastName, userName, email, password,
//         role?: 'patient' | 'doctor', licenseNumber?, specialty? }
// The role is a request, not a grant. Anything other than 'doctor' becomes
// 'patient' (there is no way to sign up as an admin), and a doctor starts as
// doctorStatus='pending' with no access to patient data until approved by an
// admin (node db/approveDoctor.js).
router.post('/signup', async (req, res) => {
  const { firstName, lastName, userName, email, password } = req.body;
  const isDoctor = req.body.role === 'doctor';
  const licenseNumber = String(req.body.licenseNumber ?? '').trim();
  const specialty     = String(req.body.specialty ?? '').trim();

  if (!firstName || !lastName || !userName || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (isDoctor && !licenseNumber) {
    return res.status(400).json({ error: 'License number is required for doctor accounts' });
  }
  if (isDoctor && (licenseNumber.length > 64 || specialty.length > 100)) {
    return res.status(400).json({ error: 'License number or specialty is too long' });
  }

  let conn;
  try {
    const existing = await query(selectUser + ' WHERE userName=?', [userName]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const hashed = await bcrypt.hash(password, 10);

    // User row + doctor profile go in together or not at all.
    conn = await db.promise().getConnection();
    await conn.beginTransaction();
    const [ins] = await conn.query(
      insertUserWithRole,
      [firstName, lastName, userName, hashed, email,
       isDoctor ? 'doctor' : 'patient', isDoctor ? 'pending' : 'none']
    );
    if (isDoctor) {
      // Collision is rare (8 chars from a 33-char alphabet) but the unique
      // constraint on inviteCode makes it a possibility worth handling rather
      // than letting a random clash fail someone's signup.
      let lastErr;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await conn.query(insertDoctorProfile, [ins.insertId, licenseNumber, specialty, genInviteCode()]);
          lastErr = null;
          break;
        } catch (e) {
          if (e.code !== 'ER_DUP_ENTRY') throw e;
          lastErr = e;
        }
      }
      if (lastErr) throw lastErr;
    }
    await conn.commit();

    // Auto-create feature_preferences with all features enabled. Fire-and-forget
    // is intentional (a missing preferences row just means the client sees the
    // InitialState default of "everything on" until it's created), but still
    // awaited so the error, if any, is logged in order rather than racing the
    // response below.
    try {
      await query(
        'INSERT IGNORE INTO feature_preferences (user_id, chkBgtracker, chkCommunityLibrary, chkMeetings) ' +
        'VALUES (?, 1, 1, 1)',
        [ins.insertId]
      );
    } catch (prefErr) {
      console.error('feature_preferences insert failed:', prefErr.message);
    }

    return res.status(201).json({
      message: isDoctor
        ? 'Doctor account created — pending approval'
        : 'User registered successfully',
    });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch { /* connection already gone */ } }
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Username already taken' });
    }
    return res.status(500).json({ error: e.message });
  } finally {
    if (conn) conn.release();
  }
});

// ── POST /auth/signin — log in, returns token + user ─────────────────────────
router.post('/signin', async (req, res) => {
  const { userName, password } = req.body;

  if (!userName || !password) {
    return res.status(400).json({ error: 'userName and password are required' });
  }

  try {
    const rows = await query(selectUser + ' WHERE userName=?', [userName]);
    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const match = await bcrypt.compare(password, rows[0].password);
    if (!match) return res.status(400).json({ error: 'Incorrect password' });

    const { password: _pw, ...safeUser } = rows[0];
    const token = signToken(safeUser);

    // Return { results: [user], token } — consistent shape the frontend expects
    return res.json({ results: [safeUser], token });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── POST /auth/tokenIsValid — validate a token (returns true/false) ───────────
router.post('/tokenIsValid', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
             || req.header('x-auth-token')
             || '';

  if (!token) return res.json(false);

  try {
    const verified = jwt.verify(token, SECRET);
    const rows = await query(selectUser + ' WHERE id=?', [verified.id]);
    return res.json(Boolean(rows && rows.length > 0));
  } catch {
    return res.json(false);
  }
});

// ── GET /auth — get the current authenticated user (protected) ────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const rows = await query(selectUser + ' WHERE id=?', [req.user.id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { password: _pw, ...safeUser } = rows[0];
    return res.json({
      results: [safeUser],
      token: (req.headers.authorization || '').replace('Bearer ', ''),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── PUT /auth/profile — edit the signed-in user's own details (protected) ─────
// The user is identified by the verified token (req.user.id), never by anything
// in the URL or body, so one user cannot edit another.
// Body: { firstName, lastName, userName, email, newPassword?, currentPassword? }
// A password change requires currentPassword. Replies with the same
// { results: [user], token } shape as /signin — the token is re-issued because
// it embeds userName / firstName / lastName.

// Same rules as the register form (client/src/hooks/useAuth.js).
function validateProfile({ firstName, lastName, userName, email, newPassword }) {
  const errors = {};
  if (!firstName || firstName.trim().length <= 3) errors.firstName = 'First name must be at least 4 characters';
  if (!lastName  || lastName.trim().length  <= 3) errors.lastName  = 'Last name must be at least 4 characters';
  if (!userName  || userName.trim().length  <= 3) errors.userName  = 'Username must be at least 4 characters';
  if (!email) errors.email = 'Email required';
  else if (!email.includes('@')) errors.email = 'Enter a valid email address';
  if (newPassword) {
    if (newPassword.length <= 5)        errors.newPassword = 'Password must be at least 6 characters';
    else if (newPassword.length >= 21)  errors.newPassword = 'Password must be under 21 characters';
    else if (newPassword.toLowerCase() === 'password') errors.newPassword = 'Cannot use "password" as your password';
  }
  return errors;
}

router.put('/profile', authMiddleware, async (req, res) => {
  const b = req.body || {};
  const values = {
    firstName: String(b.firstName ?? '').trim(),
    lastName:  String(b.lastName  ?? '').trim(),
    userName:  String(b.userName  ?? '').trim(),
    email:     String(b.email     ?? '').trim(),
    newPassword: b.newPassword ? String(b.newPassword) : '',
  };
  const currentPassword = b.currentPassword ? String(b.currentPassword) : '';

  const errors = validateProfile(values);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Please correct the highlighted fields', fieldErrors: errors });
  }

  try {
    const rows = await query(selectUser + ' WHERE id=?', [req.user.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const existing = rows[0];

    // Changing the password needs the current one.
    if (values.newPassword) {
      const ok = currentPassword && await bcrypt.compare(currentPassword, existing.password);
      if (!ok) {
        return res.status(400).json({
          error: 'Current password is incorrect',
          fieldErrors: { currentPassword: 'Current password is incorrect' },
        });
      }
    }

    // Username must stay unique (ignore this user's own row).
    if (values.userName !== existing.userName) {
      const taken = await query('SELECT id FROM users WHERE userName=? AND id<>?', [values.userName, existing.id]);
      if (taken.length > 0) {
        return res.status(400).json({ error: 'Username already taken', fieldErrors: { userName: 'Username already taken' } });
      }
    }

    if (values.newPassword) {
      const hashed = await bcrypt.hash(values.newPassword, 10);
      await query(updateUserProfileWithPassword,
        [values.firstName, values.lastName, values.userName, values.email, hashed, existing.id]);
    } else {
      await query(updateUserProfile,
        [values.firstName, values.lastName, values.userName, values.email, existing.id]);
    }

    const safeUser = {
      id: existing.id, firstName: values.firstName, lastName: values.lastName,
      userName: values.userName, email: values.email,
      role: existing.role, doctorStatus: existing.doctorStatus,
    };
    return res.json({ results: [safeUser], token: signToken(safeUser), message: 'Profile updated' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Username already taken', fieldErrors: { userName: 'Username already taken' } });
    }
    return res.status(500).json({ error: e.message });
  }
});

// ── DELETE /auth/account — delete the signed-in user's own account (protected) ─
// Body: { password }. The user is identified by the verified token, never by
// the URL or body, so nobody can delete someone else. Patients only: doctor
// accounts (clinic and patient links) and admin accounts are refused here and
// are removed by the owner with db/maintenance/deleteUser.js.
// Deletes the person's rows in every database in one transaction (the same
// code as deleteUser.js). Ids of the remaining users are NOT renumbered now:
// that would log everyone else out. The weekly rebuild closes the gap.
router.delete('/account', authMiddleware, async (req, res) => {
  const password = req.body && req.body.password ? String(req.body.password) : '';
  try {
    const rows = await query(selectUser + ' WHERE id=?', [req.user.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const existing = rows[0];

    if (existing.role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts cannot be deleted here. Contact the owner.' });
    }
    if (existing.role === 'doctor') {
      return res.status(403).json({ error: 'Doctor accounts cannot be deleted here yet. Contact the owner.' });
    }

    const ok = password && await bcrypt.compare(password, existing.password);
    if (!ok) {
      return res.status(400).json({
        error: 'Password is incorrect',
        fieldErrors: { password: 'Password is incorrect' },
      });
    }

    await deleteUser(existing.userName, true, () => {});
    // Minimal record that a self-delete happened: id and time only, no name or health data.
    console.log(`account deleted: user id ${existing.id} at ${new Date().toISOString()}`);
    return res.json({ message: 'Account deleted' });
  } catch (e) {
    console.error('delete account failed:', e.message);
    // The Sunday rebuild locks tables; a delete that collides with it times out or
    // deadlocks. Nothing was changed (one transaction), so say to try again.
    if (e && (e.code === 'ER_LOCK_WAIT_TIMEOUT' || e.code === 'ER_LOCK_DEADLOCK' ||
              e.errno === 1205 || e.errno === 1213)) {
      return res.status(503).json({ error: 'The system is busy with maintenance. Nothing was changed. Please try again in a few minutes.' });
    }
    return res.status(500).json({ error: 'Could not delete the account. Nothing was changed.' });
  }
});

module.exports = router;
