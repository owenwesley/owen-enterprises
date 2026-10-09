# OwenEnterprises

Three small web apps that share one login, one server and one React front end:

| App | What it does |
|---|---|
| **BGTracker** | Blood glucose readings (up to 5 a day), blood pressure, medications, weight/BMI, nutrition, insulin sliding-scale maths, and BG / BP / weight / A1C charts |
| **Community Library** | Books, movies (up to 12 titles per disc/collection) and contacts, with cover-image upload and "who has it" lending status |
| **Meetings** | Meeting attendance, chips/medallions, deposits and a running balance, with chair and memo lookup lists |

Each user chooses which of the three apps they see (gear icon → feature preferences).

**Current version: 1.11.22** (in both `package.json` and `client/package.json` — kept in sync as of this release; the root `package.json` had been left at 1.0.0 since the project began).
BGTracker was last released standalone as 1.3.27; Community Library and Meetings were each at 1.0.0. 1.4.0 is the first release of the three as one project.

---

## Contents

1. [Quick start](#quick-start)
2. [Configuration](#configuration)
3. [Project layout](#project-layout)
4. [How it fits together](#how-it-fits-together)
5. [Schema upgrades](#schema-upgrades)
6. [Data conventions](#data-conventions)
7. [API overview](#api-overview)
8. [Front-end notes](#front-end-notes)
9. [Authorisation](#authorisation)
10. [Doctor accounts](#doctor-accounts)
11. [Patient ↔ doctor linking](#patient--doctor-linking)
12. [Clinics](#clinics)
13. [Church module](#church-module)
14. [Known limitations](#known-limitations)
15. [Version history](#version-history)

---

## Quick start

**You need:** Node.js 20.9 or newer (required by `sharp`), and a MySQL-compatible server (MySQL or MariaDB). It was developed against MySQL and last exercised on Node 22 + MariaDB 10.11. The database user needs permission to `CREATE DATABASE` — the four databases and every table are created automatically on first start.

```bash
# 1. install (server at the project root, React app in client/)
npm install
npm install --prefix client

# 2. create a .env file in the project root (see Configuration below)

# 3a. development: API on :4000 + Vite dev server on :3000 (proxies API calls to :4000)
npm run dev

# 3b. production: build the React app, then let the server serve it
npm run build --prefix client
NODE_ENV=production npm start        # http://localhost:4000
```

Other scripts (project root): `npm start` (plain `node server.js`), `npm run server` (nodemon), `npm run client` (Vite dev server only). In `client/`: `npm run dev` / `npm start` (dev server), `npm run build` (writes `client/build`), `npm run preview` (serve the built app locally).

There is no full automated test suite, but `npm run check` (`tests/prerelease-check.js`) runs a short pre-release check against the running server: sign-up/sign-in, the 90-row weight cap, per-user access, and every Delete-my-account rule. It uses throwaway `testchk_...` users and removes them. It does not run the weekly rebuild.

---

## Configuration

Settings are read from environment variables. A `.env` file in the project root is loaded automatically (it is loaded first thing in `server.js`, so it also covers `JWT_SECRET`).

```ini
# .env
PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=owen
DB_PASS=change-me
JWT_SECRET=a-long-random-string
```

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | The React dev server proxies to this (`client/package.json` → `proxy`) |
| `DB_HOST` / `DB_PORT` | `localhost` / `3306` | |
| `DB_USER` / `DB_PASS` | `root` / *(empty)* | |
| `DB_GATEWAY` | `owenenterprises` | Users and feature preferences |
| `DB_BGTRACKER` | `bgtracker` | |
| `DB_COMMUNITYLIBRARY` | `communitylibrary` | |
| `DB_MEETINGS` | `meetings` | |
| `DB_CHURCH` | `church` | Church module: `churches` and `members`. A **fifth** database; created automatically |
| `MAINTENANCE_REBUILD_ENABLED` | *unset (off)* | Set `true` to run the weekly table rebuild **and id renumbering** (1..N, no gaps) — see the 1.10.4 entry in *Version history* |
| `MAINTENANCE_TZ` | `America/Los_Angeles` | Time zone the Sunday 12-4 AM window is measured in |
| `JWT_SECRET` | *insecure built-in fallback* | **Always set your own.** Tokens last 8 hours |
| `NODE_ENV` | — | `production` makes the server serve `client/build` |

---

## Project layout

```
owenenterprises/                 ← project root = the Node/Express server
├── server.js                    entry point: mounts routes, runs start-up jobs
├── package.json                 server dependencies and dev scripts
├── controllers/
│   └── mediaUploadController.js cover images → 400×600 WebP (sharp), placeholder fallback
├── middleware/
│   ├── auth.js                  verifies the JWT on every protected route
│   ├── ownerOnly.js             the :user_id in the URL must match the signed-in user (403 otherwise)
│   ├── doctor.js                requireDoctor / requireApprovedDoctor (role + status read from the DB)
│   ├── admin.js                 requireAdmin (role read from the DB)
│   ├── patientAccess.js         requirePatientAccess(column) — an active link AND that sharing flag must be on
│   ├── normalizeDate.js         converts any incoming date to YYYY-MM-DD (400 if invalid)
│   └── upload.js                multer: memory storage, 10 MB, images only
├── routes/
│   ├── auth.js                  /auth  (signup, signin, tokenIsValid, current user)
│   ├── doctor.js                /doctor  (account status + invite code, patient list, read-only patient data)
│   ├── admin.js                 /admin  (list doctors, set doctorStatus, manage clinics + doctor's clinic)
│   ├── patientDoctors.js        /patient-doctors  (link via code, list own links, toggle sharing, revoke)
│   ├── bgtracker/               readings, bloodpressures, weights, medications,
│   │                            nutritions, preferences   (one file per operation)
│   ├── communitylibrary/        books, movies, contacts, upload
│   ├── meetings/                meetings, chairs, memos
│   └── owenenterprises/         featurePreferences
├── tests/
│   └── prerelease-check.js      pre-release check against the running server (npm run check)
├── db/
│   ├── db.js                    the four connection pools
│   ├── init.js                  creates databases + tables at start-up
│   ├── migrateDates.js          start-up clean-up: legacy dates → YYYY-MM-DD
│   ├── schemaSync.js            start-up: adds missing columns and widens ENUM columns (see *Schema upgrades*)
│   ├── backfillInviteCodes.js   start-up: generates an inviteCode for any doctor_profiles row missing one
│   ├── approveDoctor.js         admin CLI: list / approve / reject doctor accounts
│   ├── makeAdmin.js             admin CLI: promote/revoke/list admin accounts (the only way to create one)
│   ├── retention.js             daily sweep: readings older than 10 years
│   └── sql/<feature>/*.js       SQL statements, kept apart from the routes (clinics.js lives under owenenterprises/, not bgtracker/ — see *Clinics*)
├── utils/
│   ├── dateFormat.js            date parsing / storage / output helpers
│   ├── coerce.js                toBit / toNum / io & lost mapping for client input
│   ├── dbRespond.js             UPDATE replies (404 when nothing matched)
│   ├── collectionFormat.js, sanitize.js
├── images/                      uploaded covers (books/, movies/, placeholders/) → served at /images
└── client/                      ← the React app (its own package.json)
    ├── package.json             app version lives here
    ├── index.html           Vite entry page (loads src/index.jsx)
    ├── vite.config.js       React plugin, dev proxy to the API, build → client/build
    └── src/
        ├── index.jsx, App.jsx
        ├── components/NavBar/   router, app bar, auth gate (the app shell)
        ├── context/AppContext.jsx   single useReducer store for the whole app
        ├── hooks/               useAuth, useFeaturePreferences
        ├── utils/               api.js (fetch + JWT), dateFormat.js, coerceInput.js
        ├── pages/               LoginPage, RegisterPage, FeaturePreferencesPage, DoctorHomePage,
        │                        DoctorPatientDetailPage, AdminDoctorsPage, MyDoctorsPage
        └── features/
            ├── Landing.jsx      feature picker
            ├── bgtracker/       hooks/, pages/, components/ (Tables, Charts, Preferences, Help), utils/
            ├── communityLibrary/  BooksPage, MoviesPage, ContactsPage, hooks/
            └── meetings/        MeetingsPage, ChairsPage, MemosPage, hooks/
```

---

## How it fits together

**Start-up sequence** (`server.js`): load `.env` → create any missing databases and tables → rewrite any old-format dates → start listening → schedule the daily retention sweep.

**Databases and tables**

| Database | Tables |
|---|---|
| `owenenterprises` | `users`, `feature_preferences` (one row per user, `UNIQUE(user_id)`) |
| `bgtracker` | `readings`, `bloodpressures`, `weights`, `medications`, `nutritions`, `preferences` |
| `communitylibrary` | `books`, `movies`, `contacts` |
| `meetings` | `meetings`, `chairs`, `memos` |

Every data table has an integer `id` and a `user_id`. Table definitions live in `db/init.js` (and `db/db.js`, which also creates tables) — keep the two in step if you change a schema.

**Request flow:** the browser sends `Authorization: Bearer <jwt>` on every call (`client/src/utils/api.js`, falling back to the token stored in `sessionStorage` so a page refresh keeps working). `middleware/auth.js` checks it, the route runs a parameterised query from `db/sql/`, and the hook that made the call updates the reducer.

**Retention:** once a day the server deletes `readings` dated more than 10 calendar years back (it keeps a rolling window, e.g. 2017 onward in 2026). Only the `readings` table is swept.

---

## Schema upgrades

`db/init.js` runs at every start-up. For each table it creates it if missing; if it already exists it compares the live columns with the definition and adds any that are absent (`db/schemaSync.js`), then, for any `ENUM` column, adds any values the definition has that the live column doesn't allow yet (e.g. adding `'admin'` to `users.role`). To add a column, or a new value to an existing `ENUM`, edit that table's `CREATE TABLE` in `db/init.js` (and mirror it in `db/db.js`, which keeps a second copy of the definitions) — existing databases pick it up on the next start.

Both are additive only. Column sync never drops, renames or changes the type of a column, and never touches data. Enum widening never removes or reorders a value already in use — it only appends new ones — and leaves the column's current nullability and default exactly as they were, ignoring whatever the definition says for those. Indexes and foreign keys in a definition are applied only when the table is first created. A column or enum value that can't be added is logged (`✗ table.column: reason`) and start-up carries on.

**Tightened (NOT NULL) tables and their migration.** Nine tables have been tightened to `NOT NULL` columns with no `DEFAULT` (so a write that forgets a field fails loudly instead of quietly storing NULL): `nutritions`, `readings`, `bloodpressures`, `medications`, `weights`, `preferences` (all `bgtracker`) and `meetings`, `chairs`, `memos` (`meetings`). A brand-new install gets this straight from `db/init.js`. A database created earlier keeps its old nullable columns, because column sync never re-types anything, until you run `node db/maintenance/migrateAllSchemas.js` (dry run: reports NULL counts, changes nothing) and then `... --apply` (backfills NULLs to the value that table's add route already writes, then `MODIFY COLUMN`s to the exact definition read from `db/init.js`). `--tables=meetings,chairs` limits it to some tables. It is idempotent, and it is never run automatically. Take a backup before `--apply`. `contacts`, `books`, `movies` and `feature_preferences` were already `NOT NULL`; `doctor_profiles.inviteCode`, `clinic_id` and `requestedClinicId` are nullable on purpose (no code, no clinic, no pending request).

---

## Data conventions

**Dates.** Every `date` column (`readings`, `bloodpressures`, `weights`, `nutritions`, `meetings`) stores ISO `YYYY-MM-DD`, which sorts correctly as text. The API returns dates as `MM-DD-YY`, which is what the screens display.

- Writes accept `MM-DD-YY`, `MM-DD-YYYY` or `YYYY-MM-DD` (`-` or `/`); `middleware/normalizeDate.js` converts them before they reach SQL. An impossible date (e.g. `02-30-26`) is rejected with HTTP 400. A blank date stays blank.
- Two-digit years always mean 20xx.
- At start-up `db/migrateDates.js` rewrites any leftover legacy row (e.g. `09-09-26` → `2026-09-09`). It is safe to run repeatedly, never touches rows already in ISO, never changes ids, and leaves unreadable values as they are, listing them in the log so they can be corrected by hand.

**Ids are stable for insert, update, and single-row delete** — every `db/sql/**` statement file uses plain SQL statements, so an id never changes as a side effect of any add, edit or delete. (An older design rebuilt whole tables on every write, using a temporary table that didn't carry the `id` column — that reshuffled every user's ids on every write and could send an edit to the wrong row. This pattern has now been removed everywhere it was found: `medications`, `nutritions`, `bloodpressures`, `readings`, `preferences`, `weights`, `meetings`, `memos`, `chairs`, and `contacts` were all audited and fixed; `grep -rl "CREATE TEMPORARY TABLE" db/sql/` returns nothing.) If a table's contents genuinely need a full physical rewrite in the future — for example a change that isn't a simple column add — use `db/maintenance/rebuildTable.js`, a standalone, manual, opt-in CLI that preserves every row's id via an atomic `RENAME TABLE` swap, reapplies the source table's `AUTO_INCREMENT` counter, and recreates/redirects every foreign key touching the table in either direction; nothing calls it automatically. **As of 1.10.4 `rebuildTable.js` also renumbers `id` to 1..N with no gaps** (default; `--keep-ids` opts out), remapping every column in other tables that stores that id — see the 1.10.4 entry. Ids therefore stay stable on every *write*, but a scheduled rebuild deliberately compacts them, so never store a row id anywhere outside the database (a bookmark, a note) expecting it to survive.

**List order** is set by an explicit `ORDER BY` in each GET: readings, blood pressure, weights and nutrition by date; medications by name; books by title; movies by name; contacts by last name.

**Every add/edit route coerces every column before it reaches SQL**, because the tightened tables reject NULL. Numbers go through `toNum` (`''`, `null`, junk -> 0), text through `toStr` (`null`/missing -> `''`; add routes then apply their placeholder such as `'N/A'`), checkboxes through `toBit`, and a missing `date` becomes `''` (all in `utils/coerce.js`). A new column on a tightened table needs its route changed in the same commit, and the same column added to `migrateAllSchemas.js` only if it changes an existing one.

**Edits.** `POST …/edit/:user_id` answers **404** if no row matched (wrong id, another user's row, already deleted) instead of pretending it worked. Checkbox-style fields go through `utils/coerce.js`, so `"0"`, `"false"`, `0` and `false` all mean off. Preferences are one row per user, updated in place; fields a request omits keep their stored value.

---

## API overview

All routes except `/auth/signup`, `/auth/signin` and `/auth/tokenIsValid` require the bearer token.

| Area | Base path |
|---|---|
| Auth | `/auth` — `POST /signup`, `POST /signin`, `POST /tokenIsValid`, `GET /` (current user) |
| Feature toggles | `/owenenterprises/features` — `GET /:user_id`, `POST /edit/:user_id` |
| BGTracker | `/bgtracker/{readings, bloodpressures, weights, medications, nutritions, preferences}` |
| Community Library | `/communitylibrary/{books, movies, contacts}`, `POST /communitylibrary/upload` |
| Meetings | `/meetings`, `/meetings/chairs`, `/meetings/memos` |
| Static | `/images/...` (covers) and, in production, the built React app |

Each data area follows the same pattern:

```
GET   <base>/:user_id                list this user's rows
POST  <base>/add/:user_id            create
POST  <base>/edit/:user_id           update   (body includes the row's id)
POST  <base>/delete/:user_id         delete   (body: { id })
POST  <base>/deleteAll/:user_id      delete all of this user's rows (where provided)
POST  /bgtracker/readings/deleteByYear/:user_id    body: { year: "26" | "2026" }
```

---

## Front-end notes

- **State** is a single `useReducer` store (`context/AppContext.jsx`). The session (token + user) is kept in `sessionStorage`, so a refresh keeps you signed in.
- **Routing and shell.** `components/NavBar/index.jsx` holds the router, the app bar and an auth gate. Which nav links appear depends on the active feature and the user's preferences (BP and weight pages only show if enabled).
- **Layout rule: the page itself never scrolls.** `.app-shell` is exactly the viewport tall and `.app-content` fills the rest. Every page must fill that space and scroll *inside itself* (tables, forms). Login, register and landing pages use `flex: 1 1 auto; min-height: 0; overflow-y: auto`.
- **Charts** (Chart.js 3 via react-chartjs-2). Chart.js sizes its `<canvas>` to its *parent*, so each canvas sits in a dedicated `ChartBox` with nothing else in it; headers and messages go beside it. The frame is a flex column, so the chart takes whatever height is left. The A1C page has three tabs (Colaberated → 120 Days → Quarterly); `/a1cchart` on its own shows Colaberated. Chart pages load their own data, so opening one directly works.
- **Editing.** Readings edit through a draft (`editDraft`) so keystrokes never touch the list; the other tables edit in place by row. Edit mode is cancelled whenever you change page. Adding a row refetches the list so the new row has its real id and can be edited straight away.
- **Weights.** kg and lbs are two views of one number; whichever you edit last wins and the other (and BMI, from the height in preferences) is recalculated on save.
- **Code-splitting (1.11.14).** Only Login, Register and Landing are in the main bundle; every other page is loaded the first time it is visited (`React.lazy` in `components/NavBar/index.jsx`, wrapped in one `Suspense` with a spinner). `vite.config.js` `manualChunks` puts React in `react-vendor` and Chart.js in `charts`, so the charts chunk downloads only when a chart page opens. First load went from one 833 kB chunk to about 481 kB (React 134 kB + app 347 kB). `lazyPage()` reloads the page once if a chunk file has disappeared after a deploy. When adding a page, import it with `lazyPage(() => import(...))`, not a plain `import`.
- **Build note.** The client is built with Vite 5 (`@vitejs/plugin-react`), still on React 17 and MUI 5. `vite.config.js` holds the dev-server proxy: the URL prefixes the Express server owns (`/auth`, `/bgtracker`, `/communitylibrary`, `/meetings`, `/doctor`, `/admin`, `/patient-doctors`, `/owenenterprises`, `/images`) go to `http://localhost:$PORT` (PORT is read from the root `.env`, default 4000). `/meetings`, `/doctor` and `/admin` are also React Router pages, so a request that accepts `text/html` (a browser navigation or refresh) is answered with `index.html` instead of being proxied. If you add a new server route prefix, add it to `API_PREFIXES` there. Build output stays in `client/build`, so `server.js` is unchanged. Files containing JSX must end in `.jsx` (Vite does not parse JSX in `.js`). There are no `REACT_APP_*` variables; client env vars would be `VITE_*` read via `import.meta.env`.

---

## Authorisation

Every data route carries the owner's id as the last segment of its path (`GET /bgtracker/weights/7`, `POST /meetings/edit/7`, ...). `middleware/ownerOnly.js` requires that segment to be present, all-digit, and equal to the signed-in user's id (from the JWT, checked by `middleware/auth.js` first) — anything else, including a missing id, is `403`. It's applied in `server.js` per mount:

```js
app.use('/bgtracker', auth, ownerOnly({ exempt: [...] }), require('./routes/bgtracker'));
```

A few routes legitimately carry no user id and are listed per mount as `exempt` (a list of regexes tested against the path within that mount): `POST /bgtracker/preferences/delete/:id` takes a *preferences row* id rather than a user id (its SQL is scoped to the signed-in user's own row instead), and the three `communitylibrary/upload/*` routes only write a file and return its URL. `/doctor` and `/admin` aren't wrapped in `ownerOnly` at all — each does its own role/approval checks (`middleware/doctor.js`, `middleware/admin.js`).

A few `UPDATE`/`DELETE` statements that took a row id but no `user_id` (medications, preferences, meeting chairs, memos) were also given `AND user_id=?`, so the URL check and the SQL agree: a request with the right URL id can't touch a different user's row by id. The "list every user's rows" endpoints (`GET /bgtracker/readings`, `/bloodpressures`, `/medications`, `/preferences` with no id) had no caller in the client and were removed rather than scoped.

`middleware/auth.js` also confirms, after the signature check, that the token's `id` **and** `userName` still match a `users` row (one indexed lookup per request). This is what makes renumbering `users.id` safe: a token issued before a renumber is refused (401) instead of silently acting as whichever user now holds that number. Profile edits re-issue the token, so renaming yourself does not log you out.

This is the fix the "Known limitations" note in earlier versions called out. See the version history for what was tested.

---

## Doctor accounts

Everyone registers on the same page. Role only matters for the BGTracker doctor-linking feature below, so it's an optional checkbox ("I'm a doctor signing up to view patient data") rather than a forced choice — a user who only wants Community Library or Meetings never has to declare themselves a "patient" to sign up; every account is `role: 'patient'` unless that box is checked, and that value has no bearing on which of the three apps (BGTracker, Community Library, Meetings) an account actually uses — that's controlled separately in Feature Preferences.

- `users.role` is `patient` (default), `doctor` or `admin`; `users.doctorStatus` is `none`, `pending`, `approved` or `rejected`. A doctor also has a `doctor_profiles` row (licence number, specialty, invite code).
- **A signup can only request the doctor role.** It is created as `pending`; there is no way to sign up as anything else (including `admin`), and nothing in the request can set the status.
- **Approval — two ways, same effect:**
  - **Admin page** (`/admin`, for a signed-in `admin` user): lists every doctor account with their license and current status, with Approve / Reject / Reset to pending buttons. Backed by `GET /admin/doctors` and `POST /admin/doctors/:id/status`, both behind `middleware/admin.js`.
  - **Server CLI**, unchanged: `node db/approveDoctor.js --list`, then `node db/approveDoctor.js <userName>` (or `reject` / `pending`).
- **Becoming an admin is CLI-only, on purpose.** There is no signup role or web page that grants it — the one step that has to happen outside the app, so nothing reachable from the internet can mint its own admin: `node db/makeAdmin.js <userName>` (and `node db/makeAdmin.js <userName> revoke` / `--list`). Pick an existing account (there's no dedicated "admin signup") and promote it.
- The JWT carries `role`, but authorisation does **not** trust it: `middleware/doctor.js` and `middleware/admin.js` read role/status from the database on each request, so approving, rejecting, or revoking takes effect immediately rather than when the 8-hour token expires. Any route that touches patient data must use `requireApprovedDoctor`.
- Doctors land on `/doctor` instead of the feature picker; admins land on `/admin`. Once approved, a doctor sees their invite code and their linked patients (see *Patient ↔ doctor linking* below).
- Databases created before 1.5.0 get the `role`/`doctorStatus` columns automatically at start-up; ones created before 1.7.0 get `admin` added to the `role` column's allowed values the same way (see *Schema upgrades* above). Existing users are unaffected either way.

---

## Patient ↔ doctor linking

A patient links to a doctor with a short **invite code** the doctor shares out of band (in person, by phone, however) — there is no doctor-side "request this patient by email" flow, so nothing here can enumerate or contact a patient the doctor doesn't already know.

- Every approved doctor has an 8-character `inviteCode` (`doctor_profiles.inviteCode`), generated at signup and shown on their `/doctor` page with a copy button. A doctor created before invite codes existed gets one backfilled automatically at start-up (`db/backfillInviteCodes.js`).
- A patient enters the code on their own **My Doctors** page (`/my-doctors`, linked from a stethoscope icon in the nav bar). `POST /patient-doctors/link` looks the code up, and creates the link **only if that doctor is `approved`** — a valid code for a still-`pending` doctor fails with the same "Invalid or inactive code" message a bogus code gets, so there's no way to tell the two apart from the outside.
- **Entering the code is the patient's consent.** The link (`doctor_patients`) is created `active` immediately; there's no separate doctor-side accept step yet. All four sharing flags — blood pressure, weight, blood glucose readings, medications — default to on, and the patient can turn any of them off per doctor at any time from the same page.
- **Revoking is immediate and total.** `POST /patient-doctors/:id/revoke` sets the link to `revoked`; every doctor-side read for that patient starts returning `403` on the next request. Re-linking (entering the code again) reactivates the same row and remembers whatever sharing choices were there before, rather than resetting them or creating a duplicate.
- **Doctor access is read-only**, and scoped twice over: `middleware/doctor.js`'s `requireApprovedDoctor` (only an approved doctor can use `/doctor/patients/*` at all), then `middleware/patientAccess.js`'s `requirePatientAccess(column)` (the specific link must be `active` **and** that specific sharing flag must be on). `GET /doctor/patients` lists a doctor's active patients with what each currently shares; `GET /doctor/patients/:patientId/{weights,bloodpressures,readings,medications}` return that one data type, or `403` if it isn't shared.
- The doctor's patient-detail page (`/doctor/patients/:patientId`) shows blood pressure and weight as charts (reusing the same chart components the patient's own pages use, fed with data fetched for that patient rather than the doctor's own — nothing here touches the doctor's own `AppContext` state) and medications as a plain table. A patient not sharing a given type sees "Not shared by this patient" in that type's place instead of an empty chart.
- Blood glucose readings and their A1C/BG charts aren't wired into the doctor view yet — the chart math depends on the patient's own `timesPD` preference, which isn't fetched for a doctor's view. The `GET .../readings` route exists and is access-controlled the same way as the others; only the chart UI is pending.
- **If a doctor is rejected or reset to pending** (from `/admin` or `node db/approveDoctor.js`), every one of their active patient links is revoked at the same time. `requireApprovedDoctor` already blocks all patient-data access the instant the status stops being `approved`, regardless of what `doctor_patients` says — so this isn't what protects data in the moment. It's what stops a *later* re-approval of the same account from silently restoring access to every old patient with no new consent (an account reinstated after a suspension, or any other reason for the status change). Re-approving only restores the account's ability to receive new links; old patients show up as revoked on their own "My Doctors" page and have to actively re-link. This is a status change, not a clinic change — see *Clinics* below for that distinction.

---

## Clinics

A clinic is where a doctor currently works — `clinics` (id, name, address) plus `doctor_profiles.clinic_id`, a nullable pointer to it. It's admin-managed from `/admin` (add a clinic, assign or clear which clinic each doctor is at) and shown to the doctor themselves on `/doctor`. A doctor can also browse clinics and submit a change request, which an admin approves or rejects from `/admin`; only an admin's approval writes `clinic_id`.

**It's informational only, and deliberately kept separate from patient access.** Assigning, changing, or clearing a doctor's clinic never touches `doctor_patients` — a patient's link is with the doctor as a verified, individually-approved account, not with whichever building they currently work out of. A doctor moving to a new clinic keeps every existing patient link exactly as it was; nothing to re-consent to. What *does* cut off access is the doctor's `doctorStatus` leaving `approved` (see the cascade note above) — that's a change in the account's standing, which is a different thing from a change in address. Deleting a clinic doesn't delete the doctors at it either: they just become clinic-less (`clinic_id` set back to `NULL`).

That `NULL`-on-delete is enforced two ways, deliberately not just one: `doctor_profiles.clinic_id` has a real `ON DELETE SET NULL` foreign key on a freshly created database, but `db/schemaSync.js` only adds columns, not constraints, so a database upgraded from before clinics existed has the `clinic_id` column with no such constraint. `routes/admin.js` doesn't rely on the constraint being there: it explicitly clears any doctor's `clinic_id` before deleting a clinic, and explicitly checks a clinic exists before assigning one, so both operations behave the same way whether or not the FK is actually present.

`db/sql/owenenterprises/clinics.js` holds plain single-statement CRUD only — no drop-and-rebuild-the-table pattern (see `db/sql/bgtracker/bloodpressures.js` for what that looks like and *Data conventions* above for why it exists there). A clinic's id is a foreign-key target, so renumbering it on every write — the way that older pattern does — would silently repoint a doctor at the wrong clinic.

---

## Church module

Step 1 of the Church module (design agreed 2026-10-04, built in 1.11.19). A church is a **group that users belong to**, not a separate kind of account. It is **off by default**: a person turns it on in Feature Access (`feature_preferences.chkChurch`, default 0). Doctor and admin accounts do not see it.

**What step 1 does:** a user requests a church (it starts *pending*; an admin approves it with a script) and becomes its owner. Other users join with the church's 8-character join code and wait for the owner to approve them. The owner approves or declines people, removes members and edits the mission statement. Members see the member list (display names only) and the mission statement. Nothing else is shared: joining a church exposes no one's library, health data or contact details.

**Not in step 1 (planned, not built):** the library link (sharing books and movies, a church catalog, linked contacts), prayers, finances, missions, announcements, per-church area toggles, more roles (treasurer, mission leaders), ownership hand-over, a church switcher beyond a simple picker. Meetings stays separate and is not connected to church data in any way.

**Database `church`** (env `DB_CHURCH`, default `church`; the fifth database). `dbNames()` in `db/init.js` includes it, which is what makes `idRefs.js`, `rebuildTable.js`, `cleanOrphans.js` and `deleteUser.js` look inside it. Tables are named for what they hold:
- `churches`: `id`, `name`, `missionStatement`, `joinCode` (8 characters, unique), `status` (`pending` / `approved` / `rejected` / `suspended`), `createdAt`.
- `members`: `id`, `church_id` (a real foreign key to `churches(id)`, `ON DELETE CASCADE`), `user_id` (a plain number, because a foreign key cannot cross databases; users live in `owenenterprises`), `role` (`owner` / `member`), `status` (`pending` / `active` / `removed`), `createdAt`, `UNIQUE (church_id, user_id)`.
- Every person column in any future church table must be named `user_id` so the renumbering and delete tools find it by name. Table definitions are identical in `db/init.js` and `db/db.js`.

**API** (`routes/church.js`, mounted at `/church` behind `auth` + `ownerOnly`; every path ends with the signed-in user's id):

| Method and path | Needs |
|---|---|
| `GET /church/mine/:user_id` | my churches (join code shown to the owner of a working church only) |
| `POST /church/create/:user_id` `{ name, missionStatement }` | one church waiting for approval at a time (409 otherwise) |
| `POST /church/join/:user_id` `{ joinCode }` | unknown code and not-approved church both answer 404 |
| `GET /church/:church_id/members/:user_id` | `members.view` (owner also sees waiting people) |
| `POST /church/:church_id/members/approve/:user_id` `{ memberId }` | `members.manage` |
| `POST /church/:church_id/members/remove/:user_id` `{ memberId }` | `members.manage` (never the owner) |
| `POST /church/:church_id/edit/:user_id` `{ missionStatement }` | `church.edit` |
| `POST /church/:church_id/leave/:user_id` | any member, including a pending one (the owner cannot leave) |

**Roles are permissions.** `middleware/church.js` maps each role to fixed permissions (`church.view`, `church.edit`, `members.view`, `members.manage`); routes ask for a permission, never a role name. Access needs an **active** membership in an **approved** church, read from the database on every request. Everything else (not a member, pending, removed, church pending / rejected / suspended, church does not exist, bad id) gets the same 403.

**Admin approval is a script, not a web page:** `node db/approveChurch.js --list` and `node db/approveChurch.js <id> approve | reject | suspend | pending | delete`. Rejecting or suspending marks every non-owner member *removed*, so a later re-approval does not quietly bring everyone back. Deleting a church removes its member rows.

**Deleting accounts:** the owner of a church cannot delete their account (`DELETE /auth/account` answers 409 with a clear message; `deleteUser.js` refuses too) until the church is deleted with `approveChurch.js <id> delete`. A plain member can delete their account; their membership rows go with it.

**Front end:** `client/src/features/church/ChurchPage.jsx` (Overview and Members tabs, a church picker when someone is in more than one) and `hooks/useChurch.js`. The page path is **`/my-church`** (the API prefix `/church` is separate, like `/my-doctors` and `/patient-doctors`), so no browser-refresh special case is needed. `/church` is in `API_PREFIXES` in `client/vite.config.js`. Switch, Landing card, account-menu entry and nav link all follow `chkChurch`.

**Tests:** `npm run check:church` (`tests/church-role-matrix.js`, 72 checks) talks to the running server and creates throwaway `testchu_<time>_a..e` users and churches, removing them at the end. Run it against test data. It does not run the weekly rebuild.

**Verified in the sandbox (MariaDB 10.11, Node 22):** an empty `church` database is filled by the server on start; `npm run check:church` 72 passed; `npm run check` 28 passed on a production-mode server (23 on a dev server); the weekly rebuild (`scheduleRebuild.js --now`) with church rows present renumbered `churches.id`, `members.id` and, through the users renumber, `members.user_id`, with `members.church_id` following and the cascade rule and unique key preserved; an upgrade that lacked `chkChurch` gained the column on start. **Not verified:** the Church page in a real browser or on a phone; MySQL 8; Windows.

**Known edges:** a user can have only one church waiting for approval; no ownership hand-over; a removed person may ask to join again (the owner can decline again); the join code cannot be changed or revoked yet (delete and re-request, or ask for a code-reset feature); no rate limit on join attempts (the code is 8 characters from a 32-character alphabet); church names are not unique. Lawyer review (step E1) should cover church data, and prayers explicitly, before real congregations use it.

---

## HIPAA gate, two-step sign-in (text message) and HTTPS

Everything here is **off until you set it in `.env`**, so installing the release changes nothing by itself.

**What it does**
- `HIPAA_GATE=on` — BGTracker data (a person's own, and a doctor's view of a patient) needs, in order: BGTracker switched on in Feature Access (`feature_preferences.chkBgtracker`; no row means off), two-step sign-in set up, the consent forms in `config/hipaaForms.js` accepted. Every access is written to `audit_log` *before* the data is served; if that write fails the request fails. Nothing is logged for people with BGTracker off. The client sends people to `/consent` (`client/src/pages/ConsentPage.jsx`) when the server answers `MFA_REQUIRED` or `HIPAA_CONSENT_REQUIRED`; `BGTRACKER_DISABLED` on `/bgtracker` is ignored quietly because readings are requested at login for everyone.
- **Two-step sign-in by text message** (US and Canada numbers) through **Twilio Verify**, with 8 one-time recovery codes. Account menu > Two-step sign-in. Phone numbers are stored encrypted (`user_mfa.phoneEnc`).
- **Remember this device for 30 days** (tick box on the code step). Only a hash of a random token is kept (`mfa_trusted_devices`); the password is always still required. Forgotten when two-step is turned off, the phone is changed, or "Forget remembered devices" is pressed.
- People who enrolled with an authenticator app before 1.11.20 can still sign in with its code until they use "Switch to text messages".
- `FORCE_HTTPS=on` — refuses plain HTTP (except `http://localhost`) and sends HSTS. Only use behind something that provides HTTPS and sets `X-Forwarded-Proto`. It does not create a certificate.

**`.env` settings**

| Setting | Meaning |
|---|---|
| `HIPAA_GATE=on` | turn the gate on |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio console > Account info |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio console > Verify > Services > create one (starts `VA`) |
| `MFA_KEY` | long random string; encrypts phone numbers and old authenticator secrets. Set once and keep it |
| `FORCE_HTTPS=on` | see above |
| `MFA_SMS_PROVIDER=mock` | **tests only**: no text is sent and the code is always 123456. Never on a real site |

In the Twilio console allow only the **United States and Canada** (Verify service settings and Messaging > Geo permissions) so codes cannot be requested to other countries. Twilio's price page (checked 2026-10) lists $0.05 per successful verification plus about $0.0083 per US text; Canadian text prices were not checked. A text is billed even if never delivered or entered, which is why texts are limited to 5 per person per 15 minutes and why remembering a device matters.

**Tests** (start the server for them as shown)
- `npm run check:twilio` — no server needed; checks the Twilio request code against a local fake.
- `npm run check:mfa` — server started with `MFA_SMS_PROVIDER=mock`.
- `npm run check:hipaa` — server started with `HIPAA_GATE=on MFA_SMS_PROVIDER=mock`.
- With the gate on, `npm run check` fails its BGTracker steps because its throwaway users have no flag, two-step sign-in or consent; run it with the gate off.

## Known limitations

Please read these before putting real users' data on it.

- **CORS is open** to every origin, and `JWT_SECRET` falls back to a public default if unset.
- **Silent failures in the UI.** The front end does not show HTTP errors; a failed save just reverts when the list reloads.
- **Meetings "reset"** is done client-side (delete every row, then re-add), so a failure part-way loses data.
- **Legacy files:** `db/setup.sql` is now just a deprecation stub (its old contents were stale); `db/init.js` is the schema source of truth. `db/sql/users.js` is a re-export shim for `db/sql/owenenterprises/users.js` (kept for backward-compatible import paths) — the real SQL lives in the latter (the unused `insertUser`, `updateUser` and `deleteUserById` were removed in 1.10.3). Table definitions exist in both `db/init.js` and `db/db.js`, and must be kept identical — a mismatch would mean a fresh install and a `db/db.js`-only path disagree.

---

## Version history

**1.11.22** — insulin stock now follows typed doses.
- **Fix:** `client/src/features/bgtracker/hooks/useReadings.js` deducted Slow / Fast insulin from the Medications table only when sliding scale was on (`carbRatio > 0`). With it off, typed doses never reduced stock. Deduction now runs whenever a dose changes, by the before/after difference: a re-save with no change takes nothing, lowering a dose gives the difference back, and clearing a dose to 0 now refunds it (it used to be skipped). Not retroactive. Sliding-scale users see no change.
- Known, unchanged: matching is by the exact medication names "Fast Acting" / "Slow Acting"; in single-insulin mode the one dose is stored in the Slow column, so it deducts from "Slow Acting"; stock can go below 0.

**1.11.21** — small follow-up to 1.11.20, no new features.
- **Login order:** the client now loads feature settings before readings (`components/NavBar/index.jsx`). The server creates a missing `feature_preferences` row on the first GET and the HIPAA gate treats a missing row as BGTracker off, so with the gate on an older account could get an empty readings list on its first load.
- **Audit log and account deletion:** comment in `db/init.js` and `db/db.js` corrected. `deleteUser.js` deletes audit_log rows by column name (`user_id` and `patient_id`), so the `SET NULL` foreign keys never act; this matches what the consent forms say. Behaviour unchanged. Waiting on the lawyer (see handoff note).
- **Checked, no change needed:** sliding-scale insulin deduction after the 1.11.20 med fix (real browser: 100 -> 91 -> 91 on re-save -> 93 on a lower dose -> 89 with a Meds tick in the same save).

**1.11.20** — HIPAA gate, audit log, two-step sign-in by text message (Twilio), consent screen, HTTPS option; med-tick deduction fix.
- **Gate:** `middleware/hipaaGate.js` on `/bgtracker` and the doctor patient-data routes (see *HIPAA gate*). New tables in `owenenterprises`: `hipaa_consents`, `audit_log`, `user_mfa`, `mfa_recovery_codes`, `mfa_trusted_devices`. Off unless `HIPAA_GATE=on`.
- **Two-step sign-in:** `routes/mfa.js` (`/auth/mfa`), `utils/smsVerify.js` (Twilio Verify, plain `fetch`), `utils/mfaDevices.js`, `utils/totp.js` (only for pre-1.11.20 authenticator enrolments). `/auth/signin` returns `{mfaRequired, mfaToken, mfaMethod, phoneHint}` instead of a session token when two-step is on and the device is not remembered.
- **Client:** code step on the login page, `pages/SecurityPage.jsx`, `pages/ConsentPage.jsx` (`/security`, `/consent`), global handling of the gate's 403 codes in `utils/api.js`.
- **Forms:** `config/hipaaForms.js`, version 2 (text-message wording, mentions Twilio). The privacy contact email is still a placeholder.
- **HTTPS:** `middleware/forceHttps.js`.
- **Fix:** ticking a Meds box on the Readings page deducted nothing unless the Medications page had been opened first; the list is now read from the server when saving (`useReadings.js`).
- **Admin helper:** `node db/mfaCheck.js <userName>` (diagnostics for the older authenticator-app method).

**1.11.19** — Church module, step 1: request a church, join with a code, owner approves members, mission statement.
- **New fifth database `church`** (`DB_CHURCH`, default `church`) with `churches` and `members` (see *Church module*). Added to `dbNames()` so renumbering, orphan checks and account deletion cover it.
- **Off by default:** new column `feature_preferences.chkChurch` (default 0), added to existing databases at start-up by `schemaSync`. The Feature Access route only changes `chkChurch` when the request carries it, so an older page saving without it cannot switch Church off.
- **Server:** `routes/church.js` (`/church`), `middleware/church.js` (role to permission map), `db/sql/church/`, `db/approveChurch.js` (admin script), a guard in `db/maintenance/deleteUser.js` and `DELETE /auth/account` so a church owner cannot be deleted before the church.
- **Client:** `features/church/` (page and hook), a Church card on Landing, a switch on Feature Access, an account-menu entry and a nav link. Page path `/my-church`; `/church` added to `API_PREFIXES`.
- **Tests:** `tests/church-role-matrix.js` (`npm run check:church`, 72 checks). The existing `npm run check` is unchanged (28 production, 23 dev).
- Camera-vitals / Quick BP work is not part of this release (it remains on hold). No other table changed.

**1.11.18** — Preferences page: Edit and Save no longer run off the bottom of the screen.
- **Edit and Save pinned (`client/src/features/bgtracker/components/Preferences/index.jsx`):** the buttons used to sit at the end of the form, so on a window shorter than the Medications & Insulin tab (a typical 1366 x 768 laptop, or a small phone) they were half cut off. They now sit in a footer that never scrolls, and only the form above them scrolls when it is taller than the window.
- Measured in headless Chromium inside the real app shell (`.app-shell` / `.app-content`, 64 px top bar on desktop, 52 px on phones) at 1280 x 800, 1366 x 657, 1366 x 600, 1366 x 500, 375 x 667, 360 x 640 and 390 x 844: both buttons were fully on screen in every case on both tabs. Confirmed on the owner's laptop; not yet checked on a real phone.
- No schema change, no server change, no dependency change, nothing renamed or removed. One file changed besides the version numbers and this README.

**1.11.17** — Preferences page: the checkboxes now respond when you tap their label text, and the page fits the screen without scrolling.
- **Checkbox labels fixed (`client/src/features/bgtracker/components/Preferences/index.jsx`):** every label pointed at an `id` that no checkbox had (and two pointed at names that did not exist: `chkBloodPressure` and `chkSliddingScale`), so tapping words such as "AM Meds" did nothing and only the small box worked. Each checkbox now has an `id` equal to its `name`, rendered through a small `Check` component. Rule: give a checkbox an `id` equal to its label's `htmlFor`.
- **Compact layout:** small dropdowns (one `Pick` helper), small checkboxes, Take Insulin and Types of Insulin on one row, the sliding-scale dropdowns two across with Carb Ratio (g/unit) beside Sliding Scale 5, smaller tab labels so "Medications & Insulin" stays on one line, `box-sizing: border-box` (the old padding added 48 px on top of `height: 100%`), and content centred with `margin: auto` so a short window never cuts off the top. The helper text under Times Per Day, Height and Types of Insulin and the repeated sliding-scale lines were replaced by one caption; typo "Slliding" fixed.
- Measured in headless Chromium: both tabs fit without scrolling at 375 x 667, 390 x 844 and 1280 x 800; at 360 x 640 the Medications & Insulin tab scrolls inside by 18 px with everything switched on. Not tested on a real phone.
- No schema change, no server change, no dependency change, nothing renamed or removed. One file changed besides the version numbers and this README.

**1.11.16** — Refreshing the browser on Meetings, Doctor and Admin pages works on the live server; the pages were audited for the MUI `sx` units problem.
- **Refresh bug fixed (server.js):** `/meetings`, `/doctor` and `/admin` are both API prefixes and React Router pages. The Vite dev server already sends a browser navigation (`Accept` includes `text/html`) to `index.html`, but the production server did not, so a refresh, bookmark or typed address on `/meetings`, `/doctor`, `/doctor/clinic`, `/doctor/patients/:id` or `/admin` showed the API's JSON `{"error":"No token — please log in"}` instead of the page. `server.js` now has the same rule, only when `NODE_ENV=production`, only for GET requests that ask for `text/html`, and only for those three prefixes. The app's own `fetch()` calls do not send `text/html`, so they still reach the API, and POST/PUT/DELETE are never affected. Nothing is served that was not already public (it is the same `index.html`).
- **`npm run check` extended:** on a server that is serving `client/build` (production) it now also checks that those four paths return the app on a browser refresh and that the same path without `text/html` still reaches the API (28 checks). On the dev server (`npm run dev`) those checks are skipped with an INFO line and the total stays 23. Run against the pre-1.11.16 `server.js` the new checks fail 4 times, so they do detect the bug.
- **Audit of the remaining pages for the `sx` units problem (found in 1.11.15): nothing to fix.** Login, Register, Profile, My doctors, Doctor home, My clinic, Doctor patient detail, Doctor approvals (Admin), Meetings, Chairs, Memos and Landing were read and then measured in headless Chromium at 375 x 667, 390 x 844 and 1280 x 800. Their style objects either use small theme-unit numbers on purpose (`gap: 1.5`, `borderRadius: 4` = 16 px) or are applied with `style={}`, where plain numbers are pixels. No page overflowed sideways or had its top cut off at any size; Profile scrolls inside its own container on a 667 px phone because the form is taller than the screen, as designed.
- No schema change, no dependency change, nothing renamed or removed. Server code changed in one place (`server.js`).

**1.11.15** — Compact edit dialogs, a compact Feature Access page, and a clearer role label in the account menu.
- **Edit dialogs fit the screen:** the Contacts, Books, Movies (add/edit, films window, single film) and Nutrition dialogs now lay their fields out in two columns (three for Nutrition on wider screens) and use smaller margins, so they no longer need scrolling on a phone. Cause of the old height: the fields used `sx={{ marginBottom: 12 }}`, and MUI's `sx` multiplies that by the 8 px spacing unit (96 px per field). Shared helpers are in `client/src/components/DialogFit.jsx` (`FitDialog`, `FitContent`, `FieldGrid`, `Full`, `ImagePick`); use them for any new dialog. A dialog still scrolls inside itself (title and buttons stay in place) only when it is taller than the screen, for example a large Box Set on a phone held sideways. Measured in headless Chromium at 375 x 667: Contact 297 px, Book 345 px (395 with Out), single movie 395 px, Double Feature 592 px, Box Set 642 px, Nutrition 645 px, none scrolling.
- **Feature Access page fits the screen:** same cause as the dialogs (plain numbers inside `sx` are theme units, so `marginTop: 28` was 224 px and `borderRadius: 16` was 64 px). The card was 1048 px tall on a 375 x 667 phone with its top cut off by the centring; it is now 411 px (388 px on desktop), with sizes written as px strings, tighter padding and `margin: auto` centring that never clips the top. Only a phone held sideways (375 px tall) still scrolls. File: `client/src/pages/FeaturePreferencesPage.jsx`.
- **Account menu role label:** shows "Member" instead of "Patient" when BG Tracker is off for that user (Library / Meetings only). The stored role is unchanged; this is only the text.
- No schema change, no server change, no dependency change, nothing renamed or removed. New file: `client/src/components/DialogFit.jsx`.

**1.11.14** — Code-splitting, small account-menu fixes, and a pre-release check script.
- **Code-splitting:** see Front-end notes. Main bundle 833 kB to 347 kB (+ 134 kB React); Chart.js (190 kB) loads only on chart pages and the doctor patient page; each page is its own small file loaded on first visit. No new dependency.
- **Delete my account dialog:** the password box is focused when it opens, and Enter in either box submits (only when the red button is enabled).
- **Account menu:** more space above Delete my account (a taller row and a larger gap below Log out) so it is harder to hit by mistake on a phone.
- **Delete route:** writes one log line per self-delete (`account deleted: user id N at <time>`; no name, no health data). If the delete collides with the Sunday rebuild (lock wait timeout or deadlock) it answers 503 "busy with maintenance, nothing was changed, try again in a few minutes" instead of a generic 500.
- **`tests/prerelease-check.js` (`npm run check`):** 23 checks over HTTP plus read-only database checks; see Quick start.
- **Verified on MariaDB 10.11 and headless Chromium (production build served by the real server):** `npm run check` 23/23; login, the account menu (desktop and 375 px phone), My profile and a chart page loading their chunks, the charts chunk NOT downloaded on first load, the delete dialog (disabled button, autofocus, wrong password via Enter stays open with the error, right password deletes and lands on /login, the old login fails).
- **Not tested:** a real phone with the on-screen keyboard; MySQL 8; Windows; a delete during an actual rebuild (the 503 path is code only).
- No schema change. No file renamed or removed. New files: `tests/prerelease-check.js`.

**1.11.13** — Account menu (upper right), Delete my account, and test accounts last in the weekly renumber.
- **Account menu:** `components/NavBar/AccountMenu.jsx` replaces the separate My doctors / Profile / Feature access icons and the Logout button with one avatar + first-name button (avatar only on phones). Everyone: My profile, Feature access, Log out. Patients also get My doctors (BG Tracker on), a Switch feature list (only the features they have on) and Delete my account. Doctors get Doctor home and My clinic; admins get Doctor approvals.
- **Delete my account:** `DELETE /auth/account` (body `{ password }`, signed-in user only, identified by the token). Needs the correct password; the dialog also asks for the word DELETE. **Patients only for now:** doctor and admin accounts get 403 (the owner removes them with `db/maintenance/deleteUser.js`). It runs the same transaction as `deleteUser.js` (`main(userName, true, log)`, which now takes a `log` function and returns a summary), so every row in all four databases goes or nothing does. The person is signed out and the token stops working.
- **Renumbering:** a delete does NOT renumber the other users at once (that would log everyone out). The weekly rebuild (Sunday 12-4 AM, `MAINTENANCE_REBUILD_ENABLED=true`) closes the gap and remaps every `user_id` / `doctor_id` / `patient_id`.
- **Test accounts last:** for the `users` table only, `scheduleRebuild.js` hands out the new ids with `(userName LIKE 'test%'), id`: user names starting with "test" (case-insensitive, so `test`, `Test2`, `testuser`; also any real user whose name starts with "test") come last, each group in old id order. Manual run: `node db/maintenance/rebuildTable.js users owenenterprises --reorder="(userName LIKE 'test%'), id"`.
- **Verified on MariaDB 10.11:** wrong/missing password, no token, admin and doctor all refused with nothing deleted; a patient delete removed the user, their weights and feature preferences; the old token then got 401; the real `runRebuildAll` renumbered 5 users to 1..5 with test, testuser2 and Tester9 last and every user's rows still attached to the right person; a fresh login worked. `vite build` succeeds.
- **Not tested:** the menu and dialog in a real browser or on a phone; MySQL 8. Uploaded book/movie images are not tied to a user and are not removed.
- No schema change.

**1.11.12** — Weight Add works on an empty table again.
- **Reverted the 1.11.10 blank-form guard in `useWeights.js` `addWeight`.** Add must save a row of zeros (the date plus 0 kg / 0 lbs / 0 BMI) so a new user can start, then edit the row. The guard made Add do nothing for a user with no weights. Editing a row to 0 kg is still refused (unchanged).
- No schema change, no server change.

**1.11.11** — Weight tracker and chart keep 90 days, not 91 (or 120).
- **Weights are capped at the newest 90 on the server:** `weights/add.js` runs the new `trimWeights` SQL after every insert. The old browser-side trim deleted only ONE row when the table had 90 or more, so a table already at 91 stayed at 91 (and a failed delete left it there). Any user already over 90 is corrected on their next add.
- `useWeights.js` no longer deletes the oldest row itself; it shows the newest 90 and refetches.
- **Weight chart now plots the last 90 entries** (was 120): patient chart (`useChartData.js`) and the doctor's patient page. New `getLabels('weight', ...)`. BG chart stays at 120, BP at 90.
- A weight dated older than all 90 stored rows is dropped right after saving (the cap is by date).

**1.11.10** — Small fixes: medication deduction, blank weight, Contacts, delete confirms, film search.
- **Bug fixed, `useReadings.js` `stopEditingReading`:** the Meds-tick deduction was saved from the ORIGINAL medication list, so for a medication that was also reduced by the sliding-scale dose in the same save, the second write started from the old quantity and overwrote the first. One working medication list now goes through both steps, and the final quantities are put in state once. (Found by reading; not reproduced against a database.)
- **Weight Add:** (SUPERSEDED in 1.11.12: the blank-form refusal was removed.)
- **Contacts:** same fix books/movies got. The dialog holds its own copy and saves it through new `saveContact`; edit/delete use the real index (a search no longer edits or deletes the wrong contact); deleting asks to confirm. `handleContactChange`, `startEditingContact`, `stopEditingContact` and `editIdx` are gone from `useContacts`.
- **Delete confirms:** deleting a whole book, movie or set now asks first.
- **Movies search:** also matches film titles inside a set.
- No schema change, no server change, no files to delete.

**1.11.9** — Movies: one A-Z grid, per-film Out/Who and picture. Books: borrower fix.
- **Movies, schema:** `movies` gains 36 columns, `io1..io12`, `who1..who12`, `img1..img12`, so every film in a Double/Triple/Quad/Box Set has its own In/Out, borrower and picture. Defaults are In / "In Library" / no picture. `db/schemaSync.js` adds them to an existing database on start-up; `db/init.js` and `db/db.js` stay identical. The disc-level `io`, `who` and `img_url` stay: for a single they ARE the film's status; for a set `io`/`who` are a summary the server derives (In when no film is out, else Out with the borrower, or "Several" when the films are with different people) and `img_url` is the set cover. `lost` stays at disc level.
- **Movies, migration:** new `db/migrateMovieSlots.js` (run from `server.js` after `migrateInsulinColumns`): a row that is Out at disc level but whose films all read In gets the disc's borrower copied onto films 1..numMovie. Safe to run on every start.
- **Movies, server:** `routes/communitylibrary/movies/_fields.js` now exports `buildMovie` (replaces `slotFields`/`checkWho` there): validates every Out film has a real borrower (400 "Choose who has film 2."), derives numMovie/featureMedia and the disc summary, resets films above numMovie to In / no picture. A body with no per-film io/who (older client, sparse body) applies its disc-level io/who to every film. `insertMovie`/`updateMovie` now carry 104 / 105 params.
- **Movies, page:** singles and sets are one A-Z grid in server order (`ORDER BY name, id`, names sorted exactly as typed, "The" is not skipped). Set cards read "Out: Wes Owen", "All 3 out" or "2 of 3 out". The films grid shows one card per film with its own picture, status chip and borrower. The edit dialog has per-film Status, Borrower and picture, plus "All films In" and "Lend whole set to...". "Movies (n)" still counts total films.
- **Books, bug:** `books/add.js` and `edit.js` stored `who || 'In Library'`; Out with no borrower was accepted. They now use the shared `utils/borrower.js` (`checkWho`, `whoToDb`): HTTP 400 "Choose who has this book.", In stores "In Library". The Books dialog clears the borrower when Status changes, requires a contact when Out, and cards show "Out: Wes Owen".
- **Books, bug:** `updateBook` in `db/sql/communitylibrary/books.js` had a leading `user_id=?` and `WHERE id=?` while the route sent 11 values in a different order; it is now `... WHERE id=? AND user_id=?` matching the route.
- **Books page:** the edit and delete buttons used the index in the SEARCH-FILTERED list against the full list (wrong book when a search was active); now mapped back to the real index. The edit dialog saves its own row (`saveBook`) instead of editing a stale array in app state, so cover and status changes in one save no longer overwrite each other.
- **Covers:** saving an edit with no new file uploaded the placeholder over the stored picture (same file name). Books and movies now upload only when a file was chosen or no picture exists.

**1.11.8** — Movies: borrower name, multi-title discs, films grid.
- **Bug:** a movie set to Out showed "Out: In Library" because the borrower was never cleared and the add/edit routes defaulted it to "In Library". Choosing Out now requires picking a contact (client and server both check); In always stores "In Library"; old rows showing "In Library" display plain "Out".
- **Bug:** multi-title discs were sorted into the Multi-Feature grid by whether the *name* ended in "Double Feature" etc. They are now sorted by `numMovie` / `featureMedia`.
- **Bug:** the edit dialog saved the list copy in app state, and two changes in one event (feature type + count, status + borrower) overwrote each other. The dialog now saves its own row.
- **New:** clicking a Double/Triple/Quad/Box Set card opens a grid of its films (up to 12); each film can be edited, or removed (later films shift up; the set re-labels itself and becomes a single when one film is left). The "Movies (n)" heading shows total films (a Double adds 2, a Box Set of 7 adds 7); the multi-feature section shows sets and films.
- **Server:** `routes/communitylibrary/movies/_fields.js` gains `normalizeCollection` (numMovie clamped 1-12, feature type derived from it) and `checkWho`. No schema change.

**1.11.7** — Fixed movie add/edit: `db/sql/communitylibrary/movies.js` rebuilt to match the 12-slot `movies` table.
- **Bug:** the INSERT and UPDATE in `db/sql/communitylibrary/movies.js` were from the old one-title design (`rated`, `len`, `year_released`, `media`, 10 columns), but the `movies` table in `db/init.js` / `db/db.js` and the params sent by `routes/communitylibrary/movies/add.js` and `edit.js` use the 12-slot layout (`numMovie`, `featureMedia`, `name1`..`name12`, `rated`/`length`/`yearR`/`media` 1..12; 68 values on add, 69 on edit). Every movie add and edit therefore failed with an unknown-column error. `db/init.js` and `db/db.js` were already correct and were NOT changed, so no schema change and no migration.
- **Fix:** `insertMovie` and `updateMovie` are now built from one column list (the same 12-slot order as `routes/communitylibrary/movies/_fields.js`), so they cannot drift from the table again. `updateMovie` is now `WHERE id=? AND user_id=?` (it was `WHERE id=?` only).
- **Verified** on a real MariaDB 10.11: add (full and sparse body), GET, sparse edit keeps every other field (including slots 1, 2 and 12), another user's edit is refused (404) and leaves the row unchanged, another user's delete does nothing, own delete works (9 checks). **Not verified:** the Movies page in a browser.
- **Upgrade:** unzip over the old tree and restart; one file changed besides the version lines and README.

**1.11.6** — Daily calorie goal: Preferences input, "Left" in the Nutrition Day Total, and traffic-light row colours.
- **Preferences:** new "Daily Calorie Goal" input under the "Count Carbs" checkbox (shown while that is ticked; blank/0 = no goal). Saved as `preferences.calorieGoal` (`INT NOT NULL DEFAULT 0`), a whole number 0-20000 (clamped on both the client and the server). Like the other nutrition/meds options it is zeroed when Count Carbs is off or at 1-2 readings a day.
- **Backend:** `calorieGoal` added to the `preferences` definitions in `db/init.js` and `db/db.js` (kept identical), to the INSERT / UPDATE / SELECT in `db/sql/bgtracker/preferences.js`, and to `routes/bgtracker/preferences/_save.js` (a partial save that omits it keeps the stored goal). **Upgrading needs no manual step:** restart the server and `schemaSync` adds the column; existing users get 0 (no goal).
- **Nutrition table:** with a goal set the Day Total group becomes "Day Total (goal 2,000)" and gains a **Left** column ("450 left" / "120 over"). Each row is tinted by that day's calories (visible meal slots only) against the goal: **green** under 90% of the goal, **yellow** from 90% up to the goal, **red** over it, no colour when nothing is logged. The pinned Date cell takes the same tint.
- **BG readings table:** the same tint is applied to each reading row whose date has nutrition logged (only when Count Carbs is on, a goal is set and readings are 3+ a day; the nutrition rows are loaded on that page only in that case). A row being edited keeps the edit highlight instead. `stickyFirstColSx` now paints the phone-pinned Date cell with `var(--row-tint, #fff)`, so every other table looks exactly as before.
- New `features/bgtracker/utils/calorieGoal.js` holds the bands (`NEAR_AT = 0.9`), tints, the "left/over" label and the per-date totals; change them there and both tables follow.
- Checked: against a real MariaDB 10.11 (the sandbox now has one) the upgrade from a 1.11.5 schema with an existing preferences row (column added, row keeps its data, goal 0, second start-up is a no-op), the save route (store, partial save keeps the goal, clamp/round/junk handling, new-user insert, one row per user) and the live `GET` / `POST /edit` endpoints (18 checks); band logic, per-date totals, `NutritionTable` and BG `Row` rendering (32 checks); `vite build` passes. Not checked in a browser or on a phone; MySQL 8 is still untested.
- Not done: no calorie colours on the BP-only pages (1-2 readings a day), and nothing is shown for a day with BG readings but no nutrition row. The red/green tints sit in the same family as the A1C page background bands, so they can look alike on a small screen.

**1.11.5** — Nutrition table headers now follow readings per day (`timesPD`), restored from the older NavBar.
- New `components/Tables/nutritionColumns.js`: `nutritionSlotsFor(timesPD)` and `buildNutritionColumns(timesPD)` return the meal slots and the grouped header. 3 a day: Breakfast, Lunch, Dinner. 4 a day: + Bedtime (`Bed`). 5 a day: Breakfast, Lunch, Dinner, Before Bed (`BB`), Bedtime. Nutrition is only offered at 3+ a day, so any other value falls back to the 3-meal layout. Each meal has the same 18 columns with units (Food Name, Calories, Saturated (g), Trans (g), Polyunsaturated (g), Monosaturated (g), Cholesterol (mg), Sodium (mg), Carbs (g), Fiber (g), Sugars (g), Protein (g), A/C/D (mcg), Calcium/Iron/Potassium (mg)).
- New `components/Tables/NutritionTable.jsx`: two-row header (meal name over its 18 columns, a green "Day Total" group first), pinned Date column with the edit pencil. Read-only; editing still uses the dialog, so a 54/72/90-column row is never edited inline on a phone. `NutritionPage.jsx` uses it, and its edit dialog now shows only the active meals as tabs, with the unit labels.
- `useNutrition.js`: `MEAL_SLOTS` / `NUTRIENT_FIELDS` are now built from `nutritionColumns.js` (same keys, so `emptyNutrition` still makes the same 92 fields). `dailyTotal(row, key, slots)` takes the visible slots, so the Day Total matches the columns on screen; the default is still all five. The "Bed" tab label is now "Bedtime".
- Replaces the 1.10.x note that this layout was "not applied": it was scoped as a table header change plus a read-only table, not as three duplicate tables or inline editing.
- No server or database change. Meals hidden after lowering `timesPD` keep their stored values (an edit merges over the stored row) but are not shown or counted in the Day Total.
- **Open question, not changed:** the BG readings table maps 2 a day to Breakfast + Before Bed and 4 a day to Breakfast, Lunch, Dinner, Before Bed (`SLOTS_FOR_TIMES` in `buildColumns.js`); the older `Tables.jsx` used Breakfast + Lunch at 2 a day and Breakfast, Lunch, Dinner, Bedtime at 4 a day. As written, bedtime Meds (`chkMedsBed`) cannot show at 4 a day. Nutrition follows the older file, so at 4 a day its last meal is Bedtime while the BG table's is Before Bed.
- Checked: slot lists and column counts (54/72/90) tested in Node, every column maps to a real `nutritions` field, `NutritionTable` server-rendered for `timesPD` 3, 4 and 5 (header groups, totals, Bedtime data hidden at 3), `vite build` passes. Not checked in a browser or on a phone.

**1.11.4** — Blood pressure table shows one reading set when you log once a day.
- `buildColumns.js`: new `BP_COLUMNS_ONE` (Date, SYS, DIAS, HR) and `bpColumnsFor(timesPD)`: 1 reading a day gives the one-set header, anything else keeps the two-set header (SYS/DIAS/HR twice).
- `ReadingsPage.jsx` (the `/` page, shown as the BP table when `chkBP` is on and `timesPD` is 1 or 2) and `pages.jsx` (`BloodPressurePage`, `/bptracker`) now take their header from `bpColumnsFor(preference.timesPD)`; the two hard-coded `BP_HEADER` copies are gone. This restores what the pre-refactor `Tables.jsx` did for `timesPD === 1`.
- No server or database change. The second-reading columns (`hbp2`, `lbp2`, `hr2`, NOT NULL) are still saved as 0 on add and kept unchanged on edit, so switching back to two a day loses nothing; the BP average already skips empty second readings. The BP chart still draws the second-reading lines (flat at 0) for a one-a-day user.
- Checked: header helper tested in Node (7 cases), `TableOneBP` server-rendered for `timesPD` 1 (4 columns) and 2 (7 columns), `vite build` passes. Not checked in a browser.

**1.11.3** — BG Add button now requires ALL visible Meds boxes, not just dinner/bedtime.
- `addReadingState` (`Styles/index.jsx`): if any Meds column is shown (breakfast, lunch, dinner and/or bedtime, 1 to 4 a day), every visible Meds box on the latest saved reading must be checked before Add enables. Hidden Meds slots are ignored. With no Meds columns the 1.11.2 rule still applies (last Sugar value greater than 0). No readings yet -> always enabled.
- Side effect: a user who deliberately skips a dose cannot add the next row until the box is ticked (or the row is edited). Checked: rule tested in Node (9 cases), `vite build` passes. Not checked in a browser.

**1.11.2** — BG Add button also waits for the last entry when there are no Meds boxes.
- `addReadingState` (`Styles/index.jsx`): no readings yet -> enabled. If a dinner/bedtime Meds column is shown, one of those boxes must be checked (as in 1.11.1). If there are no such Meds boxes, the latest reading's LAST Sugar value (last `sugar*` column, e.g. bedtime sugar at 5/day, breakfast sugar at 1/day) must be greater than 0. Carbs and insulin are not used because 0 is a valid value there and would lock a user out.
- Side effect to know: a day with a missed final sugar reading blocks Add until a value is entered on that row. Checked: rule tested in Node (9 cases), `vite build` passes. Not checked in a browser.

**1.11.1** — BG readings Add button is now truly disabled when it should be.
- Rule (`addReadingState` in `Styles/index.jsx`): if the user tracks dinner or bedtime meds (a `chkMedsD` / `chkMedsBed` column is shown) and the most recent reading has neither checked, the Add button is disabled (faded red, tooltip "Check Meds on your latest reading before adding another."). Otherwise it is enabled (green).
- It is always enabled when meds are not tracked or when there are no readings yet, so a user can never be locked out of adding a reading. Before, the button looked faded red in those cases but still added on click.
- `BGTable.jsx`: new `AddReadingButton` used by both header layouts. `addReadingButtonSx` now takes a `disabled` boolean. The state follows the saved reading: tick Meds on the new row and press ✓ to save, then Add enables.
- Checked: rule tested in Node (8 cases) and `vite build` passes. Not checked in a browser (disabled look, tooltip, enabling after saving a meds edit).

**1.11.0** — Client moved from Create React App (react-scripts 4) to Vite 5. No feature or behavior changes.
- `client/index.html` (moved out of `public/`) loads `src/index.jsx`; `src/index.js` and `src/App.js` renamed to `.jsx`. `client/public/` removed (it held only `index.html`).
- New `client/vite.config.js`: React plugin, dev server on port 3000, the API proxy described under Front-end notes (replaces the old `"proxy"` setting), build output kept at `client/build`.
- `client/package.json`: removed `react-scripts`, `cross-env`, `@babel/core`, `eslintConfig`, `browserslist`, `proxy`, the `test`/`eject` scripts and the `--openssl-legacy-provider` workaround. Added `vite`, `@vitejs/plugin-react`, `"type": "module"`. Scripts: `dev`, `start`, `build`, `preview`. `client/package-lock.json` regenerated.
- Root `package.json`: `npm run client` now runs `npm run dev --prefix client`. React 17, MUI 5, Chart.js 3 and React Router 5 are unchanged.
- **Verified:** `vite build` succeeds (785 modules); the dev server proxies `/meetings`, `/auth`, `/images` to a stub API for fetch requests and serves `index.html` for a browser request to `/meetings`; every URL prefix the client calls is in the proxy list. **Not verified:** the app running in a real browser against the real API (login, each page, charts, uploads), a full `NODE_ENV=production npm start` run, and hot reload on Windows/WSL.

**1.10.22** — Hamburger menu on landscape phones (front end only).
- `TopBar` (`components/NavBar/index.jsx`) now shows the hamburger + drawer when the screen is under 900px wide OR the device is a touch screen no more than 500px tall (`(pointer: coarse) and (max-height: 500px)`, the same landscape-phone test the A1C chart label plugin uses). Before, a phone turned sideways was wider than 900px and got the desktop link row, which used up scarce height. Desktops, laptops and large tablets keep the link row. Only the nav switches; table padding and the pinned Date column still key off 900px width (`theme.js`, `Styles/index.jsx`).
- **Trackers tabs (tried as 1.10.21) were dropped.** This release is 1.10.20 plus the change above; there is no `TrackerTabs` folder and no `tabsSx`. The 1.10.21 zip is the only place that code lives.
- **Verified:** file parses (esbuild). **Not verified:** a real phone in landscape (hamburger appears, drawer opens, home/profile/settings/logout icons fit) and a desktop or large tablet (link row unchanged).

**1.10.20** — Add button restyle; confirmed the client uses MUI 5 only.
- **Add buttons:** the Weights, Medications and Blood pressure table Add buttons (and the Preferences Edit button) had a hard-coded `cyan` background with unreadable white text. They are now plain MUI `<Button variant="contained">` sharing one `addButtonSx` in `Styles/index.jsx` (navy `#1a237e`, matching the Memos/Chairs/Meetings Add buttons). Restyle them all by editing that one object.
- **BG readings Add button:** the `styled(Button)` `AddButton` is gone; `BGTable.jsx` uses a plain MUI `<Button sx={addReadingButtonSx(readings)}>` (`Styles/index.jsx`). Same look and behavior: green when the latest reading has evening/bedtime meds checked, faded red when not, hover keeps the color, click still calls `onAdd`.
- **A1C chart tabs:** the Colaberated / 120 Days / Quarterly pill links (a hand-built `<ul>` with `StyledButton` and `NavBarLink`) are now an MUI `<Tabs variant="fullWidth">` (`A1CTabs` in `Charts/index.jsx`), each `<Tab>` a router `Link`. URLs are unchanged; the selected tab follows the URL (`/a1cchart` alone = Colaberated) and is marked with a navy indicator. `Styles/Button.styled.js` and `Styles/Link.styled.js` are deleted (nothing else used them). `Styles/A1C.styled.js` and `Styles/Bloodpg.styled.js` (identical wrappers) are replaced by one `chartPageSx` on an MUI `<Box>` in `Charts/index.jsx`, and deleted. `Styles/StyledDiv.styled.js` is replaced by `readingsPageSx(A1C)` / `a1cBackground(A1C)` in `Styles/index.jsx`, used as `<Box sx={readingsPageSx(A1C)}>` in `ReadingsPage.jsx` (same A1C color bands; checked identical to the old logic on boundary values). The navbar never used this color and is unchanged. No `*.styled.js` files and no `styled()` calls remain in the client.
- **Audit:** `styled-components` is not a dependency and nothing imports it. The former `Styles/*.styled.js` files used MUI 5's own `styled` and are now all converted to `sx` (Emotion is MUI's engine and stays).
- **Verified:** changed files parse with esbuild. **Not verified:** appearance in a browser.

**1.10.19** — Fixes for the known-bugs list from the 1.10.18 handoff.
- **Sparse edit bodies no longer wipe data.** New `utils/mergeExisting.js`: every edit route (readings, blood pressure, medications, nutritions, weights, books, movies, contacts, meetings, memos, chairs) loads the stored row by `id` AND `user_id` and lays only the fields the client actually sent over it, so an omitted field keeps its stored value instead of becoming `''` or `0`. A field sent as `''` or `null` is still an explicit clear. A row that does not exist for that user answers 404 as before. Preferences already worked this way. The UI always sent full rows, so normal use is unchanged.
- **Weight save no longer writes 0.** `weights/edit.js` refuses a kg that is not greater than 0 with HTTP 400, and `useWeights.js` stops before saving, shows the error toast and reloads the stored weight. New `notifyError()` in `utils/api.js` shows the standard toast for client-side problems. The weight *add* route is unchanged.
- **Admin clinic delete is transactional.** `DELETE /admin/clinics/:id` runs its three statements on one connection inside a transaction and rolls back on any failure or on a 404, so doctors can no longer be detached from a clinic that still exists.
- **Admin page:** the "Deleted clinic..." notice clears itself after 8 seconds; failed actions no longer show an inline red message on top of the global error toast (the inline message remains only for a failed initial load and for client-side validation such as an empty clinic name).
- **Two-row grouped table headers:** MUI `stickyHeader` gave every header cell `top: 0`, so header row 2 slid under row 1 when scrolling vertically. `useHeaderRowOffset()` / `twoRowHeaderSx` (`Styles/index.jsx`) measure row 1 and set row 2's `top` to that height; wired into the BG table and the Meetings table. Single-row headers are unaffected.
- **Verified:** every changed file parses (`node --check` for server files, esbuild for client files); `mergeExisting` unit-tested against a mock pool (sparse, partial, explicit clear, wrong user, missing id, id cannot be redirected). **Not verified:** any route against a real database, and the header fix in a browser.

**1.10.18** — Colaberated A1C chart: no in-bar text on phones.
- `barLabelPlugin` (`features/bgtracker/components/Charts/index.jsx`) now decides on every draw: it skips the "A1C: x % / Avg: y mg / dl" text when the chart is under 700px wide or on a touch device in landscape (`pointer: coarse` and height <= 500px). Before, the plugin was only passed as a prop when the viewport was under 900px at render time; a chart's plugins are fixed at creation, so it could persist after a resize or rotation, and landscape phones are wider than 900px. The plugin is now always passed. Desktop unchanged.
- **1.10.17 reverted:** the phone-only legend hiding on the A1C tabs was a misreading of the request and has been removed. The legend shows again on every chart.
- **Verified:** file parses (esbuild). **Not verified:** browser rendering.

**1.10.16** — Mobile-friendly layout (front end only).
- **Navigation:** below 900px wide the app bar shows a hamburger that opens a drawer with the feature's links (current page highlighted), plus home / profile / settings and an icon-only logout. Desktop bar unchanged.
- **Theme:** new `client/src/theme.js` (wrapped in `App.jsx`). Inside narrow-screen media queries only: tighter table-cell padding, ~40px tap targets for the bare edit/save icons in table cells, 12px dialog margins on phones, 40px minimum button height on touch devices.
- **Tables:** on narrow screens the Date column stays pinned while the table scrolls sideways (BG, BP, weight, medications, Meetings). Rows in edit mode (`row-editing`) and the Meetings totals row (`totals-row`) are excluded from the pinning.
- **Other:** Meetings summary line takes its own row on phones; Books/Movies cards fit two per row on phones; the bottom-right brand tag is hidden on phones; `theme-color` meta tag; `touch-action: manipulation` and text-size-adjust in `index.css`.
- **Verified:** every changed file parses (esbuild). **Not verified:** rendering in a browser or on a device. Look first at the drawer, the pinned Date column (including the two-row grouped BG header), and edit mode on a phone.
- **Not done:** editing a wide row on a phone is still inline in the scrolling table; a per-row edit dialog would be the next step.

**1.10.15** — Avg Attendance matches the original Java.
- **Avg Attendance** (`computeTotals`, `useMeetings.js`) is now total attendance divided by the number of meetings whose attendance is not 0, exactly as the Java `calculateAverage()` behaves: its `||` of the `N/A` / `Donations` memo tests never excluded anything, so the memo is ignored. This reverses the memo exclusion added in 1.10.14 (and 1.10.x before it). Attendance is compared numerically, so `'0'`, `'0.0'` and `''` count as zero. Because zero-attendance rows add nothing to the total, numerator and divisor now cover the same rows, which resolves the mismatch noted under 1.10.14. Avg Attendance and Area Donation now use the same attendance-is-not-0 test.

**1.10.14** — Avg Attendance consistency; cleanOrphans safety guard.
- **Avg Attendance** (`computeTotals`, `useMeetings.js`) now compares attendance numerically (`> 0`), like Area Donation, so `'0.0'` and `''` count as zero. The memo exclusion (`N/A` / `Donations`) is unchanged, and the redundant per-row recalculation was hoisted out of the loop. Known and left alone: the numerator is total attendance of ALL rows while the divisor counts only qualifying rows (a port of the Java behaviour), so the figure can exceed any single meeting's attendance.
- **`db/maintenance/cleanOrphans.js`** refuses to run (report or `--apply`) when the gateway `users` table has no rows, because every row in every table would then look orphaned and `--apply` would delete it all (wrong database name or `.env`).
- **Quarterly A1C chart audited, no change needed:** every day boundary (Mar 31/Apr 1, Jun 30/Jul 1, Sep 30/Oct 1, Dec 31/Jan 1, Feb 29) and a full 2023-2025 day sweep land in the correct calendar quarter with the correct day counts (90/91/92/92, 91 for Q1 in a leap year), in UTC, Los Angeles and UTC+14 time zones.

**1.10.13** — Meetings Area Donation fix.
- **Area Donation no longer stuck at 0.00:** `computeTotals` (`useMeetings.js`) now sums 10% of the deposit for every meeting whose attendance is not 0, matching the original Java rule (its `||` of two `!"N/A"` / `!"Donations"` tests never excluded anything). The earlier `&&` version excluded every row still on the default memo `N/A`, so the total stayed at 0.00. Attendance is compared numerically. Avg Attendance keeps its existing filter (it still excludes `N/A` and `Donations` memos). Front end only; syntax-checked, not browser-tested.

**1.10.12** — Open items cleared.
- **Errors are no longer silent (front end):** `utils/api.js` now reports every failed request (network down, HTTP 4xx/5xx, expired session) through a red toast (`components/ApiErrorToast.jsx`, mounted in `App.js`). Callers get exactly the same return values as before, so no call site changed. `/auth/` calls are skipped because login/register show their own messages.
- **Meetings "Reset Period" is safer:** the new rows are written first and the old rows are deleted only if every add succeeded (it used to delete first, so a failure part-way lost the period). If an add fails part-way, the old rows are kept and the already-added new rows remain, so delete those by hand.
- **CORS is configurable:** set `CORS_ORIGIN` (comma-separated origins) to restrict it. Unset, it stays open as before, so nothing breaks; the server now logs a warning at start-up. Same for an unset `JWT_SECRET`: behaviour unchanged, warning logged.
- **`db/setup.sql`** replaced by a deprecation stub.
- Still owner-run: `migrateAllSchemas.js`, `cleanOrphans.js`, `rebuildTable.js users owenenterprises`. Not browser-tested.

**1.10.11** — Weight table edit mode: typing in KG no longer blanks LBS (and vice versa), which left the box showing only its label instead of a number. The other box now fills with the converted value as you type, and the field you typed in is the one the save trusts (so 150 lbs stays 150, not 149.99). Weight and BG/medication number inputs also accept decimals (`step="any"`). Front end only; syntax-checked, not seen in a browser.

**1.10.10** — Meetings edit inputs now match the BG Tracker row inputs exactly (date 110px, number 80px, `name` attribute on every field). Date/number/dropdown types unchanged: Chair, Co-Chair and Memo stay dropdowns, everything else numeric. Front end only (`MeetingsPage.jsx`); syntax-checked, not seen in a browser.

**1.10.9** — Meetings rows now look and edit like the BG Tracker rows. Front end only; every meeting column is kept.
- **`client/src/features/meetings/MeetingsPage.jsx`:** the row being edited gets the same highlight the bgtracker tables use (tinted background, left accent bar, roomier cells, from `features/bgtracker/components/Styles/editMode.js`); edit-mode inputs are labelled and typed like `Row.jsx`'s (date picker, number fields, labelled selects for Chair/Co-Chair/Memo, `step=0.01` on Deposit); the save/edit icons have tooltips; and an *Editing meeting for <date> — unsaved changes; press ✓ on that row to save* banner with **Discard** appears above the table. The separate ✕ icon on the row was replaced by that Discard link.
- **Kept as they were:** every meeting column (Date, Chair, Co-Chair, all chips, all medallions, Attend., Memo, Deposit, Balance), the navy grouped header, the TOTALS row, Add Meeting, Reset Period, and the Avg Attendance / Area Donation / Balance summary. `useMeetings.js` and the server are untouched (the hook already used the same id + isolated-draft pattern).
- **Verified:** JSX parses and all imports resolve (esbuild). **Not verified:** rendering in a browser; the widened edit-mode row on a narrow screen is the thing to look at first (the table already scrolls horizontally).

**1.10.8** — Schema tightening finished: seven more tables are now `NOT NULL`, with one migration command for all nine tightened tables.
- **Tightened in `db/init.js` and `db/db.js`:** `bloodpressures`, `medications`, `weights`, `preferences` (`bgtracker`) and `meetings`, `chairs`, `memos` (`meetings`). Every column is `NOT NULL` with no `DEFAULT`, the same convention as `nutritions`/`readings`. Column types are unchanged (dates stay `VARCHAR(20)`, decimals stay decimals); only nullability and defaults changed. `contacts` was already `NOT NULL`, so it is untouched. After this, the only nullable columns left anywhere are the three deliberate ones on `doctor_profiles`.
- **Routes fixed first (the README's own rule: confirm every route coerces before tightening).** Found by auditing every write path, then confirmed by a live test: `bloodpressures` add/edit stored NULL when the body had no `date` (`normalizeDate` only acts when the key is present) and passed junk strings straight into `INT` columns; `medications` edit passed `name`/`dose`/`unit`/`quantity`/`prescriber` through unchecked; `chairs`/`memos` edit did the same with `name`; `meetings` add/edit used `|| 0`, which lets a junk string through to an `INT`. All now use `toNum`/`toStr` (new `toStr` in `utils/coerce.js`). Placeholder defaults on the add routes (`'Name'`, `'0.00'`, `'G'`, `'N/A'`, `'New Chair'`) are kept. `weights` and `preferences` were already fully coerced.
- **`db/maintenance/migrateAllSchemas.js` (new):** dry-run-first migration for all nine tightened tables (`nutritions` and `readings` included, whose migrations had never been run anywhere). `--apply` to change, `--tables=a,b` to limit. `migrateTableSchema.js` gained an optional per-column `columnDefaults` override, so NULLs backfill to what the add route would have written (`'N/A'` for meeting chair/co-chair/memo, etc.) rather than a blanket `''`; existing callers are unaffected. Its closing message no longer names a `create<Table>Tbl` constant that doesn't exist for most tables. The per-table wrappers (`migrateNutritionsSchema.js`, `migrateReadingsSchema.js`) still work.
- **Lockfiles:** `package-lock.json` and `client/package-lock.json` said `1.10.0`; both now match.
- **Verified against MariaDB 10.11:** built a legacy database with the 1.10.7 definitions and seeded real NULLs plus complete rows. Dry run reported exactly the seeded NULLs and changed nothing. `--apply` backfilled them and altered 9/9 tables; the complete rows were untouched; a second `--apply` was a no-op; and the migrated schema was **column-for-column identical** (type, nullability, default, extra) to a fresh install in all four databases. Live server test on the strict schema: the original 1.10.7 routes failed 8 of 20 requests (sparse bodies and junk numbers -> HTTP 500); the new routes passed 20/20, and real values still round-trip.
- **Not verified:** MySQL 8 (MariaDB only, same gap as 1.10.4); a legacy database where `nutritions`/`readings` still have their pre-tightening nullable columns (their migration was tested in 1.10.3 and re-run here only as a no-op); the browser UI. Not changed on purpose: CORS and the `JWT_SECRET` fallback (see *Known limitations*), because tightening either changes how the deployed app behaves and needs the owner's values.

**1.10.7** — Orphan cleanup tooling: `cleanOrphans.js` and `deleteUser.js`.
- **`db/maintenance/idRefs.js`:** shared helper, factored out of the id-reference lookup `rebuildTable.js` already did, so the new scripts and `rebuildTable.js` agree on what counts as a reference.
- **`db/maintenance/cleanOrphans.js`:** reports rows that point at a deleted `users` or `clinics` row (report-only by default; `--apply` fixes them in one transaction). A `user_id`/`doctor_id`/`patient_id` orphan is deleted; a `clinic_id` orphan is set to `NULL`; a `requestedClinicId` orphan is cleared along with `clinicRequestStatus`, back to `'none'`. This is what `rebuildTable.js`'s refusal message has been asking users to fix by hand since 1.10.4.
- **`db/maintenance/deleteUser.js`:** the app had no delete-account feature then (added in 1.11.13 for patients); this is still the way to remove a doctor or admin by hand. Deletes the user's rows in every table that references them, then the `users` row, all in one transaction. Refuses to delete the last admin. Report-only by default, `--apply` deletes.
- **Verified** against MariaDB 10.11 on the project's real schema: seeded orphans in `bgtracker.preferences`, `owenenterprises.feature_preferences`, and a stale `doctor_profiles.requestedClinicId`; `cleanOrphans.js` (report, then `--apply`) found and fixed all three, a second report run showed clean, and `rebuildTable.js users` / `rebuildTable.js clinics` then both renumbered successfully. `deleteUser.js` tested report and `--apply` on a user with rows in three tables (left no orphans behind, confirmed by `cleanOrphans.js` and a working `rebuildTable.js` renumber afterward), the last-admin refusal, and the unknown-username error.
- **Not changed:** the app still has no way to create these orphans in normal use through the UI (no delete-account feature) — they only build up from deleting rows by hand outside the app.

**1.10.6** — Admin page can now edit and delete clinics; deleting a clinic also withdraws pending change requests aimed at it.
- **`/admin` clinic list:** below the "Add a clinic" form there is now a table of every clinic (name, address, number of doctors) with **Edit** (inline name/address, Save/Cancel) and **Delete** (confirm dialog that says how many doctors will be left with no clinic). Uses the existing `PUT` and `DELETE /admin/clinics/:id` routes; `client/src/pages/AdminDoctorsPage.jsx` only.
- **Server fix:** `DELETE /admin/clinics/:id` now also clears `requestedClinicId`/`clinicRequestStatus` on any doctor whose pending request targeted that clinic. Previously that request was left pointing at a deleted id, and approving it would assign a clinic that no longer exists.
- **Docs:** the *Clinics* section no longer says the clinic is read-only for the doctor (doctors can browse clinics and request a change, which an admin approves or rejects).
- **Verified:** `node --check routes/admin.js` and an esbuild parse of the page. Not exercised in a browser or against a database.

**1.10.5** — Documentation-only: removed the stale *Known limitations* entry about the Meetings totals `||` bug (already fixed in 1.10.3). No code changes.

**1.10.4** — `rebuildTable.js` now renumbers every table's `id` to 1..N (no gaps) and remaps everything that points at those ids; auth token check hardened to make that safe.
- **What it does now:** for each table with an `id` column, `rebuildTable.js` copies every row into a fresh table with `id` reassigned 1, 2, 3 ... N in old-id order (or `--reorder="<ORDER BY list>"`), every other column byte-for-byte unchanged, then sets `AUTO_INCREMENT` to N+1. `--keep-ids` restores the old behaviour (rewrite without renumbering). The weekly job (`scheduleRebuild.js`, still opt-in via `MAINTENANCE_REBUILD_ENABLED=true`) renumbers all 16 tables.
- **Cross-table references are remapped in the same run.** `users.id` is stored as `user_id` in every table of all four databases (mostly with no foreign key), plus `doctor_profiles.user_id` and `doctor_patients.doctor_id/patient_id`; `clinics.id` is stored in `doctor_profiles.clinic_id` and `requestedClinicId`. Real FKs are discovered from `information_schema`; the plain-number ones are listed in `ID_REFERENCES` at the top of `rebuildTable.js` (add a line there if a table ever stores another table's id as a bare column). The remap is one InnoDB transaction using a two-pass offset so unique keys can't collide part-way; on any failure it rolls back and the swap is undone (original table live again).
- **Refuses rather than guesses:** if any referencing row points at an id that doesn't exist (an *orphan* — e.g. a deleted user's rows in `bgtracker`/`meetings`/`communitylibrary`, which have no FK so nothing cleans them up), the rebuild of that table is refused with the counts and nothing is changed, because after a renumber that stale number could belong to a different person. It also refuses if a referencing table isn't InnoDB. Expect `users` (and possibly `clinics`, via `requestedClinicId`) to be refused on a real database until orphans are cleaned up.
- **`middleware/auth.js` now checks the token's `id` + `userName` against `users`** (see *Authorisation*). Needed because the JWT carries the numeric id for 8 hours; without it, a token from before a `users` renumber would act as a different user.
- **Also fixed while in there:** the post-swap row-count check now compares the rebuilt table against the original (previously against the pre-lock count, which could not notice a row written just before the swap); the swap is undone if they differ. Scratch tables (`_rebuild_tmp`, `_rebuild_map`) are cleaned up on any pre-swap failure.
- **Side effects to know about:** after `users` renumbers, everyone is logged out once (stale token, 401) and simply signs in again. An already-open browser tab holds the old row ids until reloaded, so an edit made from it can land on a different row *of the same user* (every per-user UPDATE/DELETE is scoped by `user_id`, so never another user's). Run it at the Sunday 12-4 AM Pacific window, or by hand when nobody is using the app.
- **Verified against MariaDB 10.11** using the real schema built by `db/init.js` with gappy ids across all four databases: ownership of every row identical before/after; `doctor_patients` unique key survived; FK cascades still fire after redirect; forced mid-remap failure (trigger on `weights`) rolled back byte-identically; orphan and non-InnoDB refusals change nothing; already-contiguous tables are a no-op; `--reorder` and `--keep-ids` behave; `nutritions` (93 columns, quotes/unicode) unchanged apart from `id`; stale tokens rejected after a real `users` renumber. **Not verified:** MySQL 8 (try `--now` against a backup copy first), concurrent writes during a run, the browser UI.

**1.10.3** — `readings` schema tightened; `rebuildTable.js`'s three known gaps fixed and proven; dead `users.js` exports removed; meetings totals exclusion bug fixed.
- **`readings` tightened to match `createReadingsTbl`:** same treatment as `nutritions` in 1.10.2 — `db/init.js`'s and `db/db.js`'s `readings` `CREATE TABLE` definitions now match the reference constant in `db/sql/bgtracker/readings.js` exactly: `date` is `TEXT NOT NULL` (was `VARCHAR(20)` nullable), and every sugar/carbs/insulin column is `INT NOT NULL` while every `chkMeds*` column is `TINYINT(1) NOT NULL` (all were `DEFAULT 0`, nullable). All three definitions are now identical.
- **Real gap found and fixed before tightening:** unlike `nutritions`' add/edit routes, `routes/bgtracker/readings/add.js` and `.../edit.js` passed every numeric field straight from `req.body` with no coalescing at all — no `toNum`, no `|| 0`. A missing or explicitly-`null` field would have thrown under the new `NOT NULL` columns. Both routes now coerce every numeric field with `utils/coerce.js`'s `toNum` and every `chkMeds*` field with `toBit`, matching the standard this codebase already used elsewhere (`weights/add.js`). Verified with a live insert against the strict schema using a deliberately sparse body — every omitted field correctly defaulted to `0`/`''` instead of erroring.
- **Migration script generalized:** the 1.10.2 `migrateNutritionsSchema.js` logic was extracted into a shared `db/maintenance/migrateTableSchema.js` engine (same dry-run-first, NULL-count-then-backfill-then-`MODIFY COLUMN` approach, driven off the live `db/init.js` tableMap so it can't drift). `migrateNutritionsSchema.js` is now a thin wrapper over it; `migrateReadingsSchema.js` was added the same way. Both tested end-to-end against a real MariaDB instance: dry run reports NULLs correctly, `--apply` backfills and alters cleanly, a second `--apply` is a no-op, and the result diffs identical to the reference constant.
- **`rebuildTable.js`'s three known gaps (flagged unpatched since 1.10.1) are now fixed** — found to be worse than "unpatched" once actually tested against a real FK schema (this project has real FKs: `doctor_profiles`→`users`/`clinics`, `doctor_patients`→`users`):
  - **`AUTO_INCREMENT` counter:** confirmed by testing that `CREATE TABLE ... LIKE` does not carry the source table's live counter — a table with a counter of 6 (ids 4–5 deleted) dropped to 4 after a rebuild, and the next insert silently reused id 4. Fixed by reading the counter from `information_schema.TABLES` up front and reapplying it with `ALTER TABLE ... AUTO_INCREMENT = <value>` before the swap.
  - **`LOCK TABLES` guard:** the copy window now runs under `LOCK TABLES ... READ/WRITE` on a single dedicated connection obtained via `pool.getConnection()` rather than the pool's own `.query()` — session-scoped statements like `LOCK TABLES` and `SET FOREIGN_KEY_CHECKS` aren't guaranteed to stick across pooled calls that might land on different underlying connections.
  - **Foreign keys:** confirmed by testing (a `parent`/`child`/`grandchild` schema with real constraints) that this gap was actively dangerous, not just incomplete. `CREATE TABLE ... LIKE` drops the table's own outgoing constraints outright. Worse: MariaDB tracks an incoming FK constraint by the referenced table's physical identity, not its name — so the instant the table is renamed to `<table>_rebuild_old`, every dependent table's constraint keeps pointing at that old name, and once it's dropped, **every future insert into the dependent table fails permanently**, even with valid data. Fixed by capturing every outgoing and incoming constraint (with `ON UPDATE`/`ON DELETE` rules) before the swap, recreating the outgoing ones and redirecting the incoming ones onto the rebuilt table, and only dropping the old table once both are done. Verified: `ON DELETE CASCADE` on a redirected constraint still fires correctly after the rebuild.
  - A constraint-name collision was hit and fixed during testing: since the old table isn't dropped until after FKs are redirected, its still-live outgoing constraints share a name with the ones being re-added to the rebuilt table (constraint names are unique per schema, not per table) — fixed by dropping the old table's copy of each constraint immediately before re-adding it on the rebuilt table.
  - Not run against any table automatically, and not generalized into a "run for every table" driver — see *Declined* below.
- **`db/sql/owenenterprises/users.js` dead exports removed:** `insertUser`, `updateUser`, and `deleteUserById` were confirmed unused anywhere in `routes/` or the client (only `insertUserWithRole`, `insertDoctorProfile`, `selectUser`, `updateUserProfile`, and `updateUserProfileWithPassword` are ever imported). `insertUser` also built its SQL by string interpolation rather than placeholders. Removed outright, same reasoning as the 1.10.1 copy-table cleanup and the 1.10.2 `insertNutritionsLite` removal. The `db/sql/users.js` re-export shim needed no changes.
- **Meetings totals exclusion bug fixed:** `computeTotals` (`client/src/features/meetings/hooks/useMeetings.js`) filtered rows with `(att!=='0' && memo!=='N/A') || (att!=='0' && memo!=='Donations')` for both `avgAttendance` and `areaDonation`. For any single memo value, at least one of `memo!=='N/A'` and `memo!=='Donations'` is always true, so the `||` reduced to just `att!=='0'` — the N/A/Donations exclusion never actually excluded anything. Changed to `att!=='0' && memo!=='N/A' && memo!=='Donations'` (AND across all three conditions) in both places, matching the intent already stated in the code's own comment. Verified with a standalone functional test against sample rows.
- **Scheduled weekly rebuild (opt-in, off by default):** `db/maintenance/scheduleRebuild.js`, started from `server.js` next to `scheduleRetention()`, runs `rebuildTable` on every base table with an `id` column (16 today, all four databases) once per week, Sunday 12:00-4:00 AM in `MAINTENANCE_TZ` (default `America/Los_Angeles`, i.e. 3-7 AM Eastern). It does nothing unless `MAINTENANCE_REBUILD_ENABLED=true`. The window is a server-side schedule in one fixed zone, so it doesn't matter where individual users log in from; DST is handled by `Intl`. Guards: a `GET_LOCK` so two processes never overlap, a window re-check before every table (a run never spills past 4 AM; leftovers wait a week), sequential rebuilds, and one table failing never stops the rest. `node db/maintenance/scheduleRebuild.js --now` runs it once by hand. It is housekeeping only; ids are already stable on every write. It is never triggered by a web request or login.
- **Found only by running it against the real schema (not the toy one):** auto-named constraints (`doctor_patients_ibfk_1`) are renamed along with the table on swap, so `rebuildTable`'s drop-the-old-copy step failed on `doctor_patients`. It now looks up the old table's current constraint name by column and target. It also now refuses to run if a `<table>_rebuild_old` already exists (a previous run died after the swap, when the live table may lack constraints only the old one has) instead of silently dropping it.

**1.10.2** — `nutritions` table schema tightened to match its own canonical definition.
- **What was wrong:** every `db/sql/**` file carries its own `create<Table>Tbl` constant as a documentary reference schema, separate from the actual bootstrap definitions in `db/init.js`/`db/db.js` that create the live tables. For every other table, that reference constant is unused, dead, and drifted (stricter `NOT NULL`, no `DEFAULT`) from its table's real, looser (nullable, `DEFAULT 0`/`DEFAULT ''`) bootstrap definition — harmless, since nothing reads it. `nutritions` was the one place this drift was worth closing: its reference constant (`createNutritionsTbl`) already specified every one of the table's 92 meal-nutrient columns as `NOT NULL` with no default, and that's the schema now in force.
- **What changed:** `db/init.js`'s and `db/db.js`'s `nutritions` `CREATE TABLE` definitions were rewritten to match `createNutritionsTbl` exactly — `date` and every `foodName*` column are `TEXT NOT NULL` (was `VARCHAR` nullable/`VARCHAR DEFAULT ''`), and every numeric column is `INT NOT NULL` or `DOUBLE NOT NULL` (was `INT`/`DOUBLE DEFAULT 0`, nullable). All three definitions (the sql file's reference constant, `db/init.js`, `db/db.js`) are now identical; a comment in `db/sql/bgtracker/nutritions.js` flags that they must be kept that way, unlike every other table's now-intentionally-divergent reference constant.
- **Confirmed safe for the existing insert/update paths:** `routes/bgtracker/nutritions/add.js` and `.../edit.js` already coerce every field to `''` or `0` before querying, for every one of the 92 columns, so neither route relied on a database-level default and neither breaks under the new `NOT NULL` constraints.
- **Removed:** `insertNutritionsLite` (`INSERT INTO nutritions (user_id,date) VALUES (?,?)`) — already unused everywhere, and the kind of column it skipped would now throw ("Field doesn't have a default value") the moment anything called it. Same reasoning as the dead-export cleanup in 1.10.1: remove a landmine outright rather than leave it importable.
- **Scope and a real gap left open:** `CREATE TABLE IF NOT EXISTS` only runs on a database that doesn't have the table yet, and `db/schemaSync.js` (see its own header) only ever *adds* columns a table is missing — it never retypes or re-nulls an existing column. So this tightened schema takes effect automatically **only for a brand-new install**. Any database where `nutritions` was already created under the old (nullable) definition keeps its old column types and nullability until someone runs an explicit migration (an `ALTER TABLE ... MODIFY COLUMN ...` per column, or a `db/maintenance/rebuildTable.js` pass) against it by hand — that migration was not written or run as part of this change, since doing so against a real database with unknown existing data (some rows may well have actual `NULL`s under the old schema, which a blanket `MODIFY ... NOT NULL` would reject outright) isn't something to script blind. Flagging this here rather than leaving it to be rediscovered as a silent no-op on an existing deployment.

**1.10.1** — Id-reshuffling bug: fixed everywhere it existed, across three sessions.
- **Root cause:** many `db/sql/**` statement files had a `copy<Table>Table` SQL string appended to add/edit/delete queries — `CREATE TEMPORARY TABLE` (missing the `id` column) → copy rows in → `DROP TABLE` → recreate → reinsert. Because the temp table never carried `id`, every add/edit/delete against an affected table handed out brand-new auto-increment ids to every row for every user, not just the row being touched. Any id a client held (mid-edit, a stale page, a queued request) could silently start pointing at a different row.
- **Fixed, this arc:** `medications`, `nutritions` (prior sessions); `bloodpressures`, `readings`, `preferences`, `weights`, `meetings`, `memos`, `chairs`, and `contacts` (this session). `grep -rl "CREATE TEMPORARY TABLE" db/sql/` now returns nothing across the whole tree. Several of the tables' copy-table code was unused dead code by the time it was found (`bloodpressures`, `readings`'s `copyReadingsTable`/`deleteReadings`, `preferences`, `weights`, `meetings`); `memos`' and `chairs`' `update`/`delete` and `contacts`' `updateContact` were live and actively triggering the bug on every call.
- **`contacts` also had two pre-existing, unrelated breakages** found while checking real call sites: routes imported `insertContact` (singular) and `deleteContactById`, neither of which the sql file exported (it exported `insertContacts`, plural, and no delete-by-id) — every contact add/delete was already throwing before this fix. `updateContact` also had 9 placeholders (`SET id=?,user_id=?,...`) against only 7 params the route sends. All corrected; verified against actual route call sites, not just plausible-looking exports.
- New `db/maintenance/rebuildTable.js` (standalone, manual, opt-in CLI): the safe replacement for a genuine full-table rewrite, copying every row **including `id`** into a same-shaped table and doing an atomic `RENAME TABLE` swap. Nothing calls it automatically. As shipped this session it had three known, unpatched gaps (didn't reapply the source table's `AUTO_INCREMENT` counter; no `LOCK TABLES` guard around the copy window; `CREATE TABLE ... LIKE` doesn't carry foreign keys) — all three were closed in a later session; see the version-history entry below for what was found and fixed.
- **Nutrition nav link restored:** `client/src/components/NavBar/index.jsx`'s `buildBgNav()` now pushes `/nutrition` when `chkNutrition` is checked, alongside the existing `chkMeds` check. The route and `NutritionPage` already existed; nutrition just wasn't reachable from the nav. This reverses a prior in-code comment claiming the omission was intentional.
- Corrected a stale line in *Data conventions* claiming `POST /bgtracker/bloodpressures/deleteAll/:user_id` still used the rebuild pattern — that route was already calling the plain, safe `deleteAllBloodpressuresByUser` before this arc started, and `deleteAllBloodpressures` itself has now been removed outright as unused.
- **Maintenance CLIs now read `.env` (bug in the scripts added earlier in 1.10.3):** `scheduleRebuild.js`, `rebuildTable.js`, and the migration scripts (via `migrateTableSchema.js`) run as standalone commands, but only `server.js` and `db/db.js` loaded `.env`, so run from a terminal they fell back to `root` with no password and failed with `Access denied for user 'root'@'localhost' (using password: NO)` on any machine where that isn't valid. They now load the project-root `.env` themselves (from any working directory; already-set environment variables still win). The scheduled run inside the server was never affected, since `server.js` loads `.env` first.
- **Unused `create<Table>Tbl` reference constants deleted** from `db/sql/**` for `bloodpressures`, `medications`, `preferences`, `weights`, `contacts`, `chairs`, `meetings`, and `memos` (definitions and their `module.exports` entries). Each was verified referenced nowhere else in the codebase; the live definitions in `db/init.js`/`db/db.js` are untouched. Only `nutritions` and `readings` keep theirs, since those are deliberately kept identical to the live schema. The 1.10.2 note that other tables' constants are a "known, accepted divergence" no longer applies. If another table is tightened later, derive the target from its live definition in `db/init.js` and confirm the routes coerce every field first.
- **Book and movie delete were broken (pre-existing, found by the import audit):** `routes/communitylibrary/{books,movies}/delete.js` imported `deleteBookById`/`deleteMovieById`, but the SQL files only exported `deleteBook`/`deleteMovie`, so every delete from the Community Library threw and returned 500 (same class as the `contacts` breakage in 1.10.1). The SQL files now export `deleteBookById`/`deleteMovieById` with `WHERE id=? AND user_id=?`, matching the route's `[id, user_id]` params, so a row id alone can no longer delete another user's row. The old unscoped `deleteBook`/`deleteMovie` were unused and are gone. Verified against a real database: an owner's delete removes the row and a wrong-owner delete removes nothing.
- **Declined:** routing all `db/sql/**` writes through `rebuildTable.js` globally — it's a standalone Node CLI, not a splice-able SQL string, and wiring it into every write would mean a full table copy plus atomic rename on every add/delete (a major perf regression) while reopening the concurrency gap the targeted-statement fix was meant to close. `create*Tbl` schema-bootstrap statements (run by `db/init.js`/`db/db.js`) are unrelated to this bug and were left alone.
- **Not applied at the time (since done in 1.11.5):** two pasted code snippets from an older/different version of the app (a `<ul>`-based navbar, a class-component `/nutrition` page keyed on `timesPD` with three duplicate tables) don't match this codebase's current architecture. If a multi-table-by-`timesPD` nutrition layout is still wanted, that's a distinct UI redesign needing its own scoping conversation.
- Tested: every rewritten file was `node --check`'d; each file's `module.exports` was diffed against real import sites at every call site, not just assumed from function names — this is what surfaced the `contacts` breakages above. Nothing any route imports was removed, and nothing removed is imported anywhere else.

**1.10.0** — Weight tracker editing, the BP chart not showing for BP-only users, and retiring insulinB/insulinBed.
- **Weight tracker** (`WeightRow.jsx`, `TableWeights.jsx`, `useWeights.js`) moved to the same id + isolated-draft pattern the very first BP fix in this project established — it was the one table still using array-index edit targets and uncontrolled inputs, flagged as a known gap back in the 1.4.1 session notes and never done until now. Same editing banner + Discard as BP/readings.
- **Fixed: BP chart (and weight chart) showing nothing for a user with zero glucose readings.** `rebuildAllCharts()` — the only thing that populates `bpChartData`/`weightChartData` — was gated in `NavBar` behind `state.readings.length > 0`, a precondition that has nothing to do with blood pressure or weight. A user who only tracks BP never triggered it, so their BP chart stayed at its empty `{}` initial value forever, even with real BP data on file — it wasn't broken, it just silently never ran. Removed that gate (each `build*Chart` function already no-ops safely on empty input) and added `bloodpressures`/`weights` as explicit effect dependencies instead of relying on `rebuildAllCharts`'s reference identity to carry the change through.
- **Retired `insulinB` and `insulinBed`** from the `readings` table. These duplicated `insulinFB`/`insulinFBed` ("Fast Acting") while also being the field written in single-insulin-type mode — a confusing overlap. Single-type mode at Breakfast/Bedtime (the two slots with a Slow/Fast split available) now writes to `insulinSB`/`insulinSBed` instead, the same column two-type mode already uses for the "Slow" dose. Lunch, Dinner, and Before-Bed are unaffected — they never had a Slow/Fast split. Changed: `buildColumns.js` (front end), `db/init.js`/`db/db.js` (new installs never get the columns), `db/sql/bgtracker/readings.js`, `routes/bgtracker/readings/{add,edit}.js`, `useReadings.js`, `medications.js`.
- New `db/migrateInsulinColumns.js`: for a database that predates this, moves any historical `insulinB` value into `insulinSB` (only where `insulinSB` is still 0 — never overwrites data already there), same for `insulinBed` → `insulinSBed`, then drops both retired columns. `db/schemaSync.js` only ever adds columns, so removing one needed this explicit, one-time step.
- Both `package.json` (root/server) and `client/package.json` are versioned together from this release on. The root one had been left at 1.0.0 since the project began.
- Tested: client build compiles; the insulin migration against a simulated pre-1.10.0 database (three cases — historical value moved, historical value left alone because the new field already had one, both zero) is correct and idempotent on a second run; a fresh install never creates the retired columns at all; live add and edit of a reading through the new column layout round-trips correctly end to end.
- Not tested in a browser: the weight-editing UI and the BP chart itself. Both were fixed and verified by full code-path tracing and (for the backend halves) live HTTP testing, but I don't have a way to click through the React app in this environment.

**1.9.0** — async/await throughout the doctor portal, and a clinic entity.
- Converted every callback-style `db.query(...)` call in `routes/auth.js`, `routes/doctor.js`, `routes/admin.js`, `routes/patientDoctors.js`, and their three middleware files (`doctor.js`, `admin.js`, `patientAccess.js`) to `async`/`await` using the pools' `.promise()` interface, including the routes that call into `db/sql/*.js` statement files. Behavior is unchanged; re-verified with a full regression pass (20/20 checks) before moving on.
- New `clinics` table (id, name, address) and `doctor_profiles.clinic_id`, a nullable pointer to it — see the new *Clinics* section above for the full design and why it's informational-only, kept deliberately separate from `doctor_patients`. New `db/sql/owenenterprises/clinics.js` for the plain single-statement CRUD (not `db/sql/bgtracker/`, since this is a doctor-accounts concept living in the same database as `users`/`doctor_profiles`, not a health-data one).
- New admin routes: `GET/POST /admin/clinics`, `PUT /admin/clinics/:id`, `DELETE /admin/clinics/:id`, and `POST /admin/doctors/:id/clinic` to assign/clear a doctor's clinic. `/admin` now has an "Add a clinic" form and a clinic dropdown per doctor row; `/doctor` shows the signed-in doctor's own clinic (or "No clinic on file").
- Found and fixed two real bugs while testing this against a database upgraded from before clinics existed (as opposed to a fresh install): `doctor_profiles.clinic_id`'s `ON DELETE SET NULL` foreign key only exists when the table is created fresh — `db/schemaSync.js` adds the column on an upgraded database but not the constraint (documented, existing behavior). The clinic-assignment and clinic-delete routes were relying on that constraint to catch a bad clinic id and to detach doctors from a deleted clinic; on an upgraded database neither happened. Both routes now check and clear explicitly at the application level instead, so behavior is identical whether or not the underlying FK is present.
- Corrected a stale, inaccurate line in *Data conventions*: it claimed the old drop-and-rebuild-table pattern was fully retired, but `POST /bgtracker/bloodpressures/deleteAll/:user_id` still uses it (a known, previously-flagged, not-yet-done cleanup item, not something changed in this release).
- Tested end-to-end against both a fresh database (real FK enforced) and one upgraded from before clinics existed (no FK, application-level checks only): creating and renaming clinics, assigning and moving a doctor between clinics, clearing a clinic assignment, deleting a clinic detaching its doctors without deleting the accounts, rejecting bad/nonexistent clinic ids, and — the actual scenario this was built for — a doctor moving from one clinic to another while every one of their existing patient links stays fully intact and unaffected throughout.

**1.8.1** — Fixes for non-BGTracker users and doctor status changes.
- Registration no longer forces a binary "I'm a patient / I'm a doctor" choice on everyone. It's now a single optional checkbox, and it's about the specific BGTracker doctor-linking feature, not an identity — a Community Library or Meetings-only user never has to answer a health-context question to sign up.
- The "My Doctors" nav icon now only shows for a `patient`-role account that also has BGTracker enabled in Feature Preferences (`chkBgtracker === 1`), instead of showing for every non-doctor account regardless of which features they actually use.
- Rejecting a doctor, or resetting one to pending (from `/admin` or `node db/approveDoctor.js`), now also revokes every active `doctor_patients` link for that doctor. Access was already cut off immediately either way (`requireApprovedDoctor` checks status live on every request); the gap this closes is that the *links themselves* used to stay `active`, so re-approving the same account later would have silently restored access to every old patient with no new consent — relevant when a doctor's standing changes for any reason (moving to a different clinic, being reinstated, etc.), since there's no separate "clinic" concept in this schema for that to hang off of. The admin page now confirms before a reject/reset click that has active links to lose, and reports how many were revoked; the CLI reports the same.
- Tested against a live server and database: rejecting a doctor with an active patient link revokes it and reports the count; re-approving the same account afterward restores zero patients (not a silent restore); the patient sees the link as revoked on their own page throughout; re-linking with the same invite code after re-approval works normally; resetting to pending cascades the same way reject does; and the CLI path (`db/approveDoctor.js ... reject`) produces the same cascade and reports it.

**1.8.0** — Patient ↔ doctor linking, and read-only doctor views.
- New `doctor_patients` table: one row per doctor/patient pair, with a status (`active`/`revoked`) and four independent sharing flags (blood pressure, weight, readings, medications). `doctor_profiles.inviteCode` (8 characters, generated at signup) is what a patient enters to create the link — see `db/backfillInviteCodes.js` for how an existing doctor account gets one.
- New patient page `/my-doctors`: enter a doctor's invite code to link (creates the row `active` immediately — entering the code is the consent step), see every doctor linked so far, toggle each sharing flag per doctor, and revoke a doctor's access entirely. Revoking is immediate; re-entering the code later reactivates the same row and keeps whatever sharing choices were there before rather than resetting them. Routes in `routes/patientDoctors.js`, mounted at `/patient-doctors`.
- Doctor side: `/doctor` now shows the signed-in doctor's invite code and their linked patients; `/doctor/patients/:patientId` is a read-only view of one patient — blood pressure and weight as charts (reusing the same chart components the patient's own pages use), medications as a table. A data type the patient hasn't shared shows "Not shared by this patient" instead of an empty chart.
- New `middleware/patientAccess.js` (`requirePatientAccess(column)`): a doctor's read of `/doctor/patients/:patientId/{weights,bloodpressures,readings,medications}` requires an `active` link **and** that specific sharing flag, checked fresh from the database on every request — same immediate-effect pattern as doctor/admin approval.
- Blood glucose readings have a read-only route (`GET /doctor/patients/:patientId/readings`) but no chart in the doctor view yet — the existing A1C/BG chart math needs the patient's own `timesPD` preference, which isn't fetched for a doctor's view.
- Tested against a live server and database: linking with a pending (not yet approved) doctor's code fails with the same message a bogus code gets; a doctor can only read data types a specific patient has actively shared; turning off one sharing flag blocks only that data type; revoking blocks all of them immediately; re-linking reactivates the same row and preserves prior sharing choices rather than duplicating it; one patient can't touch another patient's link row by id; and a sneaked-in unrelated field in a sharing update is ignored rather than applied.

**1.7.0** — Admin doctor-approval page.
- New `admin` value on `users.role`. Existing databases get it added to the live `ENUM` at start-up (`db/schemaSync.js` now widens enums as well as adding columns — see *Schema upgrades*); nothing about existing users changes.
- `/admin` page (React) lists every doctor account with license/specialty and Approve / Reject / Reset-to-pending buttons, backed by `GET /admin/doctors` and `POST /admin/doctors/:id/status` (`middleware/admin.js`, `routes/admin.js`). Same DB-read-on-every-request pattern as doctor approval, so a change takes effect immediately, not when the admin's token expires.
- Becoming an admin is still CLI-only and deliberately has no web path: `node db/makeAdmin.js <userName>` (`revoke` / `--list`). `db/approveDoctor.js` (the original approval CLI) is unchanged and still works alongside the new page.
- Tested against a live server and database: enum widening on a pre-1.7.0 database (and that it's a no-op on the next start), the full approve/reject/pending cycle from a bootstrapped admin account, immediate access changes on already-issued tokens, invalid status and unknown-id handling, and that non-admins (including doctors) are refused.
- Found and fixed a MariaDB-specific bug while building the enum widening: `information_schema.COLUMNS.COLUMN_DEFAULT` comes back pre-quoted on MariaDB but not on MySQL, which was producing a broken `ALTER TABLE` statement.

**1.6.0** — Per-user authorisation.
- New `middleware/ownerOnly.js`, applied to every data-route mount in `server.js`: the `:user_id` in the URL must equal the signed-in user's id (from the JWT), or the request gets `403`. A handful of routes that legitimately carry no user id (a preferences-row delete, image uploads) are named exceptions.
- Several `UPDATE`/`DELETE` statements (medications, preferences, meeting chairs, memos) gained `AND user_id=?` so the SQL agrees with the URL check.
- Removed the "list every user's rows" endpoints (`GET /bgtracker/readings`, `/bloodpressures`, `/medications`, `/preferences` with no id) — dead in the client, and a bigger hole than the ones they were meant to serve. A now-unused `getPreferences()` client helper that called one of them was removed too.
- Tested against a live server and database: signed-in users can only read or write their own rows across every feature (weights, blood pressures, medications, readings, nutrition, preferences, chairs, memos, meetings, books, movies, contacts, feature preferences); a same-length numeric id, a trailing slash, a query-string override, and a row id belonging to another user in the request body are all refused or have no effect; existing per-row deletes and edits for one's own data still work.

**1.5.1** — Automatic schema upgrades.
- At start-up, every table that already exists is compared with its definition in `db/init.js`; any missing columns are added with `ALTER TABLE … ADD COLUMN` (existing rows take the column default). Missing tables are still created. Replaces the one-off `migrateRoles.js`.

**1.5.0** — Doctor accounts, step 1.
- Register/sign-in are shared; registering as a doctor asks for a licence number and creates a `pending` account that an admin approves (`node db/approveDoctor.js`).
- New `users.role` / `users.doctorStatus` columns and a `doctor_profiles` table; older databases are upgraded at start-up.
- Doctors land on a new `/doctor` page that shows their approval status. Linking patients and viewing readings are not built yet.
- Sign-up now uses a parameterised insert inside a transaction, and profile edits keep the role in the re-issued token.

**1.4.1** — Blood pressure table edit fix.
- BP edits are now keyed by row id and typed into an isolated draft (with an editing banner and Discard), matching the readings table.
- BP add/edit no longer rebuild the whole `bloodpressures` table, so row ids stay stable; the edit route validates the id and coerces blank numbers to 0.

**1.4.0** — first combined release of BGTracker, Community Library and Meetings.
- Dates stored as `YYYY-MM-DD`, shown as `MM-DD-YY`; automatic clean-up of old rows at start-up.
- Table edit overhaul: stable ids, 404 on missed edits, preferences that save and switch off correctly, library In/Out and Lost status preserved on edit, working nutrition insert, kg/lbs edits, edit mode reset on navigation.
- Charts fit every screen size; chart pages load their own data; A1C tabs reordered and evenly spaced; `/a1cchart` lands on Colaberated.
- Fixed empty pages after a browser refresh (first request had no token) and `JWT_SECRET` in `.env` being ignored.
- Redesigned login, register and landing pages.

**1.3.27** — last standalone BGTracker release.
