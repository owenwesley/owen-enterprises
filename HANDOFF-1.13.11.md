# HANDOFF — Doctor Portal 1.13.11 → deploy and finish verification (written 2026-10-17)

STATE
- 1.13.11 = 1.13.10 + "everything off, choose on first sign-in". 1.13.9 is on the real site; 1.13.10 and 1.13.11 are NOT.
  JWT_SECRET and DB_PASS were rotated; settings file is <domain>/private/.env (owner confirmed 2026-10-17).
- NOT run: the automated checks (no database in the sandbox). Done instead: `node --check` on changed server files,
  `vite build` of the client (clean), and the new features route run against a fake database (6/6 checks passed).
  FIRST THING after upload: `npm run check:hipaa`, then `npm run check`, against your database.
- No patients enrolled. Text messages must NOT be used by patients until the Twilio BAA question is answered.

WHAT 1.13.11 CHANGES (on top of 1.13.10's members-vs-patients)
1. Ordinary sign-up: ALL FOUR features off (BG Tracker, Library, Meetings, Church). Doctor: BG Tracker, Library, Meetings on, Church off.
   utils/featureDefaults.js is the single source (used by routes/auth.js signup and the first GET /owenenterprises/features/:id).
2. New column feature_preferences.featuresChosen TINYINT(1) NOT NULL DEFAULT 1 (db/db.js and db/init.js definitions; added
   automatically at startup by db/schemaSync.js). 0 = never saved Feature Access. Default 1 on purpose: every existing row counts as
   chosen, so no existing user is redirected. Signup and first-GET write 0 for ordinary accounts, 1 for doctors.
3. POST /owenenterprises/features/edit/:id (routes/owenenterprises/featurePreferences.js): a field not sent keeps its stored value
   (it used to default chkBgtracker/Library/Meetings to ON); any save sets featuresChosen=1; the upsert SQL takes a 6th value.
4. Client: AppContext default all 0 plus featuresChosen:1 and loaded:false; useFeaturePreferences marks loaded and sets
   featuresChosen:1 after any save; NavBar has FirstSignInRedirect (only from "/", only when loaded, not for doctor/admin) to
   /feature-preferences; FeaturePreferencesPage shows a welcome heading, "Save and continue" and "Skip for now" on first visit,
   no longer forces one feature on, only sends the four switches, and warns that BG Tracker needs two-step sign-in + consent;
   Landing shows "Nothing is turned on yet" + Choose features button when nothing is on. client/build rebuilt: replace the WHOLE folder.
5. SECOND BUILD FIX: the first 1.13.11 zip had SQL `--` comments inside the feature_preferences CREATE TABLE; schemaSync parsed the
   comment as a column name and never added featuresChosen -> new sign-ins hit "Unknown column" (500 "Something went wrong on the
   server"). Comments removed from db/init.js and db/db.js; tests/schema-parse.js (`npm run check:schema`, no DB) guards it.
   If the live DB ran the first build: restart with this build adds the column, or run once:
   ALTER TABLE feature_preferences ADD COLUMN featuresChosen TINYINT(1) NOT NULL DEFAULT 1;
   Also: AccountMenu shows "Two-step sign-in" only when BG Tracker is on (or doctor/admin). RULE: never put SQL comments in db/init.js / db/db.js table text.
6. Test results from the owner's server: hardening now PASSES (24/24; it had failed only because the owner's .env has FORCE_HTTPS=on,
   so the test now starts its server with FORCE_HTTPS=off). photos: 68 pass, 1 FAIL still open: "both files are gone from disk"
   (after DELETE /patient-photos/:id returns 200, a .webp file is still in the photo folder). Not caused by 1.13.11 (nothing touched there);
   in the sandbox (Linux) save -> read -> removeFiles deletes both files. utils/patientPhotos.js removeFiles used to swallow every error;
   it now retries 4x and logs `[photos] could not delete <file>: <code>`. The failing test line now prints which file remains, the folder,
   platform and uid. New: scripts/photoDeleteDiag.js.
   NEXT STEP: owner runs, as the same user as the app and with the same PHOTO_DIR: `PHOTO_DIR=<folder> node scripts/photoDeleteDiag.js`
   (the test folder is <os tmpdir>/oe-photos-test unless PHOTO_DIR is set) and sends the output, plus the new FAIL line from
   `node tests/run-all.js photos`, plus any `[photos] could not delete` line from the server output, plus `ls -ld` and `ls -l` of the folder,
   and says whether it runs on Windows (open files block deletes there) or Linux (permissions / a different user wrote the folder / CageFS).
   Candidate causes: folder or files owned by a different user than the app, Windows file locking, an older copy of utils/patientPhotos.js
   still being served (confirm the zip was fully uploaded and the app restarted), a network/virtual filesystem. Do NOT enrol patients or switch
   on patient photos for real use until this passes: a "deleted" photo that stays on disk is health information that should be gone.
7. tests/hipaa-gate.js "Signup defaults" section rewritten (all off, featuresChosen 0/1, partial save never turns BG on, all-off save,
   legacy row without the column = 1). README has a "1.13.11 changes" section.
- Server does NOT enforce Library/Meetings/Church flags (client hides them). Only BG Tracker is enforced (hipaaGate).
- Two-step sign-in is opt-in per account (user_mfa row, enabled=1); signup does not create one; only hipaaGate (BG Tracker on) requires it.
  Unchanged.
- NOT changed on purpose: users.role (no 'member' value), existing accounts' flags, /my-doctors and /my-photos client routes.

ROUTES SPLIT (after 1.13.11, no behavior change, not deployed): routes/church.js and routes/meetings/* now follow the bgtracker /
communitylibrary layout (see README "Unreleased: routes split"). Verified without a database by replaying 178 requests old vs new
(identical status, body, SQL, params) and by `npm run check:routes`. STILL TO RUN against your database: `npm run check` (church 1-7, report).
Upload the whole routes/ folder (routes/church.js is replaced in place; new folders routes/church/ and routes/meetings/{meetings,chairs,memos}/), plus tests/, package.json, README.md.

DEPLOY STEPS
- Back up DBs. Upload files; DELETE the old client/build folder first (asset names changed), then upload the new one. Restart.
  The restart adds the featuresChosen column; check the log / `SHOW COLUMNS FROM feature_preferences` shows it.
- Run `npm run check:hipaa`, then `npm run check`.
- Log should show no MFA_KEY / TRUST_PROXY / JWT warnings.

STILL TO VERIFY (by hand)
- `SHOW COLUMNS FROM feature_preferences` includes featuresChosen (default 1). Menu for a member has NO 'Two-step sign-in'; it appears after BG Tracker is turned on.
- Existing account signs in: NOT redirected, features unchanged.
- New ordinary sign-up: lands on "Welcome! What would you like to use?" with everything off. Skip for now -> home says
  "Nothing is turned on yet"; sign out and in: no prompt again. Another new account: turn on Library only -> Save and continue ->
  Library card only, no BG Tracker anywhere, menu says "member".
- Turn BG Tracker on in Feature Access -> note shows; opening BG Tracker sends to consent/two-step setup cleanly (no raw MFA_REQUIRED error).
- Doctor test account: no prompt, BG Tracker on, still reaches patient data.
- Enrol a test account with a real authenticator app (QR, first code, save recovery codes).
- Android + iPhone: squares accept typed, pasted, password-manager codes; submit on 6th digit.
- Audit log: wrong code, reused code, 5 wrong = lockout; restart app, lockout holds; real visitor IPs differ
  (if all same, TRUST_PROXY=1 not enough: find the hop count).
- Text messages (after Twilio): textMessagesAvailable true; text arrives; 123456 must NOT work; Twilio geo = US/Canada only;
  NEVER set MFA_SMS_PROVIDER=mock on the real site.

OPEN ITEMS
- Twilio BAA for Verify: Twilio lists Verify as HIPAA-eligible; plan requirement for a BAA unconfirmed. Get it in writing.
- DECISION: deleteUser.js still deletes a person's audit_log rows when they delete their account (consent forms say so).
  If 6-year retention must win: skip audit_log there, edit config/hipaaForms.js, raise version (forces re-consent). Decide before enrolling patients.
- A doctor can currently switch BG Tracker off in Feature Access and then gets BGTRACKER_DISABLED on every patient route.
  Consider forcing chkBgtracker=1 for role doctor in POST /features/edit (and hiding that switch for doctors).
- Delete the old zip(s) that contained the exposed .env, wherever copies exist (email, drives, downloads).
- Decide HIPAA_GATE=on, FORCE_HTTPS=on once https loads by itself; consider STRICT_SECURITY=on. Do this before enrolling anyone.
- Independent HIPAA risk assessment / security review before the first real patient.
- Optional: existing test accounts that should be members: set chkBgtracker=0 in feature_preferences for them.
- /totp/start asks only for the password when switching authenticator (needs TotpSetup.tsx + SecurityPage.jsx edits); also require a current code or recovery code.
- Per-account throttling on the password step (today per address only).
