/**
 * routes/hipaa.js  (mounted as /hipaa behind auth + ownerOnly: every path ends with the user id)
 *
 *   GET  /hipaa/status/:user_id   {bgtrackerEnabled, mfaEnabled, missing}   always answers
 *   GET  /hipaa/forms/:user_id    the forms still to accept     403 if BGTracker is off
 *   POST /hipaa/accept/:user_id   {formKey, formVersion}        403 if BGTracker is off
 *
 * Forms are only handed out, and acceptances only recorded, for a user whose
 * BGTracker flag is on. Acceptances are logged in audit_log.
 */
const express = require('express');
const { owenenterprises: db } = require('../db/db');
const { FORMS } = require('../config/hipaaForms');
const { bgtrackerEnabled, mfaEnabled, missingConsents, writeAudit } = require('../middleware/hipaaGate');

const router = express.Router();
const off = (res) => res.status(403).json({ error: 'Forbidden', code: 'BGTRACKER_DISABLED' });

router.get('/status/:user_id', async (req, res) => {
  try {
    const enabled = await bgtrackerEnabled(req.user.id);
    const missing = enabled ? await missingConsents(req.user.id) : [];
    return res.json({ results: { bgtrackerEnabled: enabled, mfaEnabled: enabled ? await mfaEnabled(req.user.id) : false, missing } });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get('/forms/:user_id', async (req, res) => {
  try {
    if (!(await bgtrackerEnabled(req.user.id))) return off(res);
    const need = new Set((await missingConsents(req.user.id)).map((m) => m.key));
    return res.json({ results: FORMS.filter((f) => need.has(f.key)) });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/accept/:user_id', async (req, res) => {
  try {
    if (!(await bgtrackerEnabled(req.user.id))) return off(res);
    const { formKey, formVersion } = req.body || {};
    const form = FORMS.find((f) => f.key === formKey && f.version === String(formVersion));
    if (!form) return res.status(400).json({ error: 'Unknown form or out-of-date version' });
    await db.promise().query(
      `INSERT IGNORE INTO hipaa_consents (user_id, formKey, formVersion, ipAddress) VALUES (?, ?, ?, ?)`,
      [req.user.id, form.key, form.version, String(req.ip || '').slice(0, 45)]
    );
    await writeAudit({ userId: req.user.id, action: 'CONSENT', resource: `${form.key}@${form.version}`,
      outcome: 'allowed', ip: req.ip });
    return res.json({ message: 'Consent recorded' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

module.exports = router;
