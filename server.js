// Must be first: middleware/auth.js reads JWT_SECRET the moment it is required, which is
// before db/db.js would have loaded .env — so a secret kept only in .env was ignored by
// the verifier (tokens signed with one secret, checked against the built-in fallback,
// and every authenticated request answered 401).
require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const limits       = require('./middleware/rateLimits');
const path         = require('path');
const multer       = require('multer');
const auth         = require('./middleware/auth');
const ownerOnly    = require('./middleware/ownerOnly');
const { hipaaGate } = require('./middleware/hipaaGate');
const initDatabases= require('./db/init');
const { scheduleRetention } = require('./db/retention');
const { scheduleRebuild } = require('./db/maintenance/scheduleRebuild');
const migrateDates = require('./db/migrateDates');
const migrateInsulinColumns = require('./db/migrateInsulinColumns');
const migrateMovieSlots = require('./db/migrateMovieSlots');
const backfillInviteCodes = require('./db/backfillInviteCodes');

const port = process.env.PORT || 4000;
const app  = express();
// Behind an HTTPS-terminating proxy (FORCE_HTTPS=on) trust X-Forwarded-Proto so req.secure is right.
// TRUST_PROXY=<hops> does the same without forcing HTTPS (needed so per-IP rate limits see the
// real visitor address behind a proxy - see middleware/rateLimits.js).
if (require('./middleware/forceHttps').isOn()) app.set('trust proxy', 1);
if (process.env.TRUST_PROXY) {
  const hops = parseInt(process.env.TRUST_PROXY, 10);
  app.set('trust proxy', Number.isFinite(hops) ? hops : process.env.TRUST_PROXY);
}
app.use(require('./middleware/forceHttps'));

// Security headers (helmet). The CSP allows only this site's own scripts, plus images from
// anywhere over https (book covers use an external placeholder) and inline styles (the UI
// library injects them). HSTS is sent only when FORCE_HTTPS is on. HELMET_CSP=off drops the
// CSP header if a deployment ever needs something it blocks.
app.use(helmet({
  contentSecurityPolicy: String(process.env.HELMET_CSP || '').toLowerCase() === 'off' ? false : {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
    },
  },
  hsts: require('./middleware/forceHttps').isOn(),
  crossOriginResourcePolicy: { policy: 'cross-origin' },   // the app may be served from another origin (CORS_ORIGIN)
  crossOriginEmbedderPolicy: false,
}));

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
    'Set a long random JWT_SECRET in .env (run: npm run secret). Existing sessions will need to sign in again.');
} else if (process.env.JWT_SECRET.length < 32) {
  console.warn('WARNING: JWT_SECRET is shorter than 32 characters. Generate a stronger one with: npm run secret');
}
// STRICT_SECURITY=on: in production, refuse to start rather than run with the weak defaults.
if (String(process.env.STRICT_SECURITY || '').toLowerCase() === 'on' && process.env.NODE_ENV === 'production') {
  const problems = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) problems.push('JWT_SECRET missing or shorter than 32 characters');
  if (!corsOrigins.length) problems.push('CORS_ORIGIN is empty');
  if (problems.length) {
    console.error('Refusing to start (STRICT_SECURITY=on): ' + problems.join('; '));
    process.exit(1);
  }
}
app.use(express.json());
app.use(limits.api);

// ── Browser refresh on pages that share a name with an API prefix ────────────
// /meetings, /doctor and /admin are both API prefixes and React Router pages.
// A browser navigation (refresh, bookmark, typed address: Accept includes
// text/html) must get the app's index.html, otherwise the person sees the
// API's JSON "No token" error instead of the page. fetch() calls from the app
// do not send text/html, so they still reach the API. This mirrors the
// `bypass` rule in client/vite.config.js, which does the same in development.
if (process.env.NODE_ENV === 'production') {
  app.use(['/meetings', '/doctor', '/admin'], (req, res, next) => {
    const wantsPage = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
    if (!wantsPage) return next();
    res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
  });
}

// ── Auth ──────────────────────────────────────────────────────────────────────
app.use('/auth/signin', limits.signin);
app.use('/auth/signup', limits.signup);
app.use('/auth/mfa/send', limits.mfa);
app.use('/auth/mfa/verify', limits.mfa);
app.use('/auth/mfa', require('./routes/mfa'));
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
  // BGTracker flag + HIPAA consent + audit log; does nothing unless HIPAA_GATE=on.
  hipaaGate(),
  require('./routes/bgtracker'));
// HIPAA consent forms (only for people with BGTracker on).
app.use('/hipaa',                    auth, ownerOnly(), require('./routes/hipaa'));
app.use('/communitylibrary',         auth,
  // Image uploads carry no user data (they only write a file and return its URL).
  ownerOnly({ exempt: [/^\/upload\/(book|movie|collection)$/] }),
  require('./routes/communitylibrary'));
app.use('/meetings',                 auth, ownerOnly(), require('./routes/meetings'));
// Church module: every path ends with the user's id (ownerOnly); routes inside a
// church also check the member's role through middleware/church.js.
app.use('/church/borrow/request',    auth, limits.borrow);   // per-user cap on borrow requests
app.use('/church',                   auth, ownerOnly(), require('./routes/church'));
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
// Movie posters are saved in client/public/images/movies/<media>/ (see
// controllers/mediaUploadController.js), so that folder is served first; images/ (book covers,
// placeholders, and any older movie posters) is the fallback. Both give /images/... URLs.
app.use('/images', express.static(path.join(__dirname, 'client', 'public', 'images')));
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
    return res.status(400).json({ error: `Upload error: ${err.message}` });   // safe: a deliberate Multer message (file too large, ...)
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body is not valid JSON.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request is too large.' });
  }
  if (err && err.status && err.status < 500) {          // other client errors (bad file type from the upload filter, etc.)
    return res.status(err.status).json({ error: err.expose === false ? 'Bad request.' : err.message });   // safe: a deliberate < 500 client error
  }
  if (err) {
    console.error('Unhandled error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
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
  // Copies an Out movie's borrower onto its films now that each film has its
  // own status (see db/migrateMovieSlots.js).
  .then(() => migrateMovieSlots())
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
