/**
 * utils/mfaAudit.js  (1.13.7)
 *
 * One audit record for every two-step sign-in event that matters:
 *
 *   MFA_VERIFY_SUCCESS / MFA_VERIFY_FAILURE   a code was checked at sign-in
 *   MFA_LOCKOUT                               too many wrong codes, user locked for a while
 *   MFA_ENROLL_START / _SUCCESS / _FAILURE    someone is setting up (or changing) a method
 *   MFA_RESET                                 two-step turned off, or the method/phone replaced
 *
 * Every record has a timestamp, the user id and the IP address, plus the method (totp, sms,
 * recovery), the route and, for failures, a reason (bad_code, replay, locked, ...).
 * It goes to TWO places:
 *   1. one JSON line on stdout (type "mfa_audit") - lands in the Plesk / host log, survives a
 *      database problem, easy to ship to a log service;
 *   2. a row in audit_log (the same table the HIPAA gate uses), outcome allowed / denied.
 *
 * NEVER written: the code the person typed, a secret, a recovery code, a phone number.
 *
 * Writing the row is best effort here, unlike middleware/hipaaGate.js, which refuses to serve
 * health data when its row cannot be written. Signing in is not health-data access (that is
 * gated and logged separately), and the stdout line is always produced first, so a database
 * hiccup cannot lock everybody out. A failed row write is itself logged ("mfa_audit_db_error").
 * Rows about a person are removed when that person is deleted (db/maintenance/deleteUser.js,
 * see the note at audit_log in db/db.js); the log lines are not.
 *
 * HIPAA Security Rule: 45 CFR 164.312(b) audit controls, 164.308(a)(5)(ii)(C) log-in
 * monitoring, 164.308(a)(1)(ii)(D) information system activity review.
 */
const { owenenterprises: db } = require('../db/db');

const EVENTS = Object.freeze({
  VERIFY_SUCCESS: 'MFA_VERIFY_SUCCESS',
  VERIFY_FAILURE: 'MFA_VERIFY_FAILURE',
  LOCKOUT: 'MFA_LOCKOUT',
  ENROLL_START: 'MFA_ENROLL_START',
  ENROLL_SUCCESS: 'MFA_ENROLL_SUCCESS',
  ENROLL_FAILURE: 'MFA_ENROLL_FAILURE',
  RESET: 'MFA_RESET',
});

/**
 * @param {object} e
 * @param {string} e.event    one of EVENTS
 * @param {number} e.userId   the person the event is about
 * @param {string} e.ip       req.ip
 * @param {'success'|'failure'} e.outcome
 * @param {string} [e.method] 'totp' | 'sms' | 'recovery'
 * @param {string} [e.reason] failures and resets: why
 * @param {string} [e.route]  e.g. '/auth/mfa/verify'
 */
async function record({ event, userId, ip, outcome, method = '', reason = '', route = '' }) {
  const entry = {
    type: 'mfa_audit',
    ts: new Date().toISOString(),
    event,
    outcome,
    userId: userId == null ? null : Number(userId),
    ip: String(ip || ''),
    ...(method ? { method } : {}),
    ...(reason ? { reason } : {}),
    ...(route ? { route } : {}),
  };
  console.log(JSON.stringify(entry));
  try {
    const detail = [method && `method=${method}`, reason && `reason=${reason}`].filter(Boolean).join(' ');
    await db.promise().query(
      `INSERT INTO audit_log (user_id, patient_id, action, resource, outcome, ipAddress, detail)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      [entry.userId, event, route || '/auth/mfa', outcome === 'success' ? 'allowed' : 'denied',
        entry.ip.slice(0, 45), detail.slice(0, 255)]);
  } catch (e) {
    console.error(JSON.stringify({ type: 'mfa_audit_db_error', ts: new Date().toISOString(), event, userId: entry.userId, error: e.message }));
  }
}

module.exports = { record, EVENTS };
