/**
 * middleware/hipaaGate.js
 *
 * Feature-flag gate for BGTracker health data, with HIPAA consent and audit
 * logging that switch on only for people who have BGTracker turned on.
 *
 * The flag is the existing feature_preferences.chkBgtracker (one flag, one
 * place; the Feature Access page already sets it).
 *
 * Runs AFTER middleware/auth.js. On the patient's own routes it also runs after
 * ownerOnly; on doctor routes after requireApprovedDoctor and requirePatientAccess.
 *
 *   hipaaGate()                       own data: req.user is the subject
 *   hipaaGate({ subject: 'patient' }) a doctor reading req.params.patientId
 *
 * For each request, in this order:
 *   1. Flag off (the actor, or on a doctor route the patient)  -> 403
 *      BGTRACKER_DISABLED. Nothing is logged: no health data was touched, so
 *      the audit trail stays limited to people who use BGTracker.
 *   2. Two-step sign-in (authenticator app) not set up by the person acting -> 403
 *      MFA_REQUIRED, logged as denied.
 *   3. Required consent forms not accepted (actor, and the patient on doctor
 *      routes)                                                  -> 403
 *      HIPAA_CONSENT_REQUIRED, logged as denied.
 *   4. Otherwise the access is written to audit_log BEFORE the handler runs.
 *      If that write fails the request fails (500): no log, no data.
 *
 * Flags and consents are read from the database on every request, never from
 * the token, so switching BGTracker off takes effect at once.
 *
 * Off-switch: nothing is enforced unless HIPAA_GATE=on in .env. It is off by
 * default so installing this release changes nothing until the client can show
 * the consent forms. With it off every request passes straight through.
 */
const { owenenterprises: db } = require('../db/db');
const { FORMS } = require('../config/hipaaForms');

const gateIsOn = () => String(process.env.HIPAA_GATE || '').trim().toLowerCase() === 'on';

/** True only when the user has a feature_preferences row with chkBgtracker = 1. No row means off. */
async function bgtrackerEnabled(userId) {
  const [rows] = await db.promise().query(
    'SELECT chkBgtracker FROM feature_preferences WHERE user_id=?', [userId]
  );
  return Boolean(rows && rows[0] && Number(rows[0].chkBgtracker) === 1);
}

/** True when the user has finished setting up two-step sign-in. */
async function mfaEnabled(userId) {
  const [rows] = await db.promise().query('SELECT enabled FROM user_mfa WHERE user_id=?', [userId]);
  return Boolean(rows && rows[0] && Number(rows[0].enabled) === 1);
}

/** Current forms the user has not accepted yet: [{ key, version }]. */
async function missingConsents(userId) {
  const [rows] = await db.promise().query(
    'SELECT formKey, formVersion FROM hipaa_consents WHERE user_id=?', [userId]
  );
  const have = new Set((rows || []).map((r) => `${r.formKey}|${r.formVersion}`));
  return FORMS.filter((f) => !have.has(`${f.key}|${f.version}`))
    .map((f) => ({ key: f.key, version: f.version }));
}

/** One audit row. Throws on failure so callers can fail closed. */
async function writeAudit({ userId, patientId = null, action, resource, outcome, ip = '', detail = '' }) {
  await db.promise().query(
    `INSERT INTO audit_log (user_id, patient_id, action, resource, outcome, ipAddress, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, patientId, String(action).slice(0, 40), String(resource).slice(0, 255),
     outcome, String(ip).slice(0, 45), String(detail).slice(0, 255)]
  );
}

const disabled = (res) => res.status(403).json({ error: 'Forbidden', code: 'BGTRACKER_DISABLED' });

function hipaaGate({ subject = 'self' } = {}) {
  return async function hipaaGateMiddleware(req, res, next) {
    if (!gateIsOn()) return next();
    try {
      const actor = req.user.id;
      const patientId = subject === 'patient' ? Number(req.params.patientId) : actor;
      if (!Number.isInteger(patientId) || patientId < 1) return disabled(res);

      if (!(await bgtrackerEnabled(actor))) return disabled(res);
      if (patientId !== actor && !(await bgtrackerEnabled(patientId))) return disabled(res);

      const audit = {
        userId: actor,
        patientId: patientId === actor ? null : patientId,
        action: req.method,
        resource: `${req.baseUrl}${req.path}`,
        ip: req.ip,
      };

      if (!(await mfaEnabled(actor))) {
        await writeAudit({ ...audit, outcome: 'denied', detail: 'mfa not set up' });
        return res.status(403).json({ error: 'Forbidden', code: 'MFA_REQUIRED' });
      }

      const missing = (await missingConsents(actor)).length > 0 ||
        (patientId !== actor && (await missingConsents(patientId)).length > 0);
      if (missing) {
        await writeAudit({ ...audit, outcome: 'denied', detail: 'consent missing' });
        return res.status(403).json({ error: 'Forbidden', code: 'HIPAA_CONSENT_REQUIRED' });
      }

      await writeAudit({ ...audit, outcome: 'allowed' });
      return next();
    } catch (e) {
      // Fail closed: if the flag, consent or audit step cannot be completed, no data is served.
      return res.status(500).json({ error: 'Access check failed' });
    }
  };
}

module.exports = { hipaaGate, bgtrackerEnabled, mfaEnabled, missingConsents, writeAudit, gateIsOn };
