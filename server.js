// Must be first: middleware/auth.js reads JWT_SECRET the moment it is required, which is
// before db/db.js would have loaded .env — so a secret kept only in .env was ignored by
// the verifier (tokens signed with one secret, checked against the built-in fallback,
// and every authenticated request answered 401).
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const multer       = require('multer');
const auth         = require('./middleware/auth');
const ownerOnly    = require('./middleware/ownerOnly');
const initDatabases= require('./db/init');
const { scheduleRetention } = require('./db/retention');
const { scheduleRebuild } = require('./db/maintenance/scheduleRebuild');
const migrateDates = require('./db/migrateDates');
const migrateInsulinColumns = require('./db/migrateInsulinColumns');
const backfillInviteCodes = require('./db/backfillInviteCodes');

const port = process.env.PORT || 4000;
const app  = express();

// CORS: open to every origin by default (unchanged behaviour, so nothing that works
// today stops working). To lock it down set CORS_ORIGIN in .env to a comma-separated
// list of allowed origins, e.g. CORS_ORIGIN=https://portal.example.com,https://www.example.com
// Requests with no Origin header (same-origin, curl, server-to-server) are always allowed.
const corsOrigins = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(
  corsOrigins.length
    ? { origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin)) }
    : { origin: '*' }
));
if (!corsOrigins.length) {
  console.warn('WARNING: CORS is open to every origin. Set CORS_ORIGIN in .env to restrict it.');
}
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set, so tokens are signed with a public default secret. ' +
    'Set a long random JWT_SECRET in .env (existing sessions will need to sign in again).');
}
app.use(express.json());

// ── Auth ──────────────────────────────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));

// ── Protected routes ──────────────────────────────────────────────────────────
// auth      → who is signed in (401 without a valid token)
// ownerOnly → the user id in the URL must be that same user (403 otherwise),
//             so nobody can read or change another user's rows.
// `exempt` lists the few routes that legitimately carry no user id in the path.
app.use('/owenenterprises/features', auth, ownerOnly(), require('./routes/owenenterprises/featurePreferences'));
app.use('/bgtracker',                auth,
  // GET /preferences/delete/:id takes a preferences row id, not a user id;
  // its SQL is restricted to the signed-in user's own row.
  ownerOnly({ exempt: [/^\/preferences\/delete\/[0-9]+$/] }),
  require('./routes/bgtracker'));
app.use('/communitylibrary',         auth,
  // Image uploads carry no user data (they only write a file and return its URL).
  ownerOnly({ exempt: [/^\/upload\/(book|movie|collection)$/] }),
  require('./routes/communitylibrary'));
app.use('/meetings',                 auth, ownerOnly(), require('./routes/meetings'));
// Doctor routes do their own role / approval checks (middleware/doctor.js).
app.use('/doctor',                   auth, require('./routes/doctor'));
// Admin routes do their own role check too (middleware/admin.js). There is no
// self-serve way to become an admin — see db/makeAdmin.js.
app.use('/admin',                    auth, require('./routes/admin'));
// Patient-side "My Doctors": every route here scopes to req.user.id itself
// (see routes/patientDoctors.js), so it doesn't go through ownerOnly either.
app.use('/patient-doctors',          auth, require('./routes/patientDoctors'));

// ── Static / SPA ──────────────────────────────────────────────────────────────
// Serve book covers / movie posters saved by the upload controller
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(express.static(path.join(__dirname, './public')));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static('client/build'));
  app.get('*', (req, res) =>
    res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'))
  );
}

// ── Error handler: Multer errors (file too large, bad type, etc.) ─────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// ── Boot: init.js checks/creates DBs and tables, then start listening ─────────
initDatabases()
  // Rewrite any legacy MM-DD-YY rows to YYYY-MM-DD before serving requests
  // (see db/migrateDates.js). Never throws — it logs and carries on.
  .then(() => migrateDates())
  // Moves any historical insulinB/insulinBed values into insulinSB/insulinSBed
  // and drops the retired columns (see db/migrateInsulinColumns.js).
  .then(() => migrateInsulinColumns())
  // Fills in an inviteCode for any doctor account that predates it. Never
  // throws — it logs and carries on.
  .then(() => backfillInviteCodes())
  .then(() => {
    app.listen(port, () =>
      console.log(`OwenEnterprises server running on port ${port}`)
    );
    // Rolling 10-year retention (readings only): prune now, then re-check
    // every 24h so the sweep fires on its own whenever the calendar rolls
    // into a new year (e.g. entering 2027 deletes any 2017-and-earlier
    // readings) — see db/retention.js for the cutoff logic and scope.
    scheduleRetention();
    // Optional weekly table rebuild, Sunday 12-4 AM Pacific (MAINTENANCE_TZ
    // to change). Does nothing unless MAINTENANCE_REBUILD_ENABLED=true — see
    // db/maintenance/scheduleRebuild.js.
    scheduleRebuild();
  })
  .catch((e) => {
    console.error('Fatal: database initialisation failed —', e.message);
    process.exit(1);
  });
