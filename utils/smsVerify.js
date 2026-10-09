/**
 * utils/smsVerify.js
 *
 * Text-message codes through Twilio Verify (https://www.twilio.com/docs/verify/api).
 * Twilio makes and checks the 6-digit code, sends it from its own number pool and
 * limits attempts; this app never sees or stores the code. No extra npm package:
 * plain HTTPS calls with Node's built-in fetch.
 *
 * .env:
 *   TWILIO_ACCOUNT_SID=AC...             Twilio console > Account info
 *   TWILIO_AUTH_TOKEN=...                same place (keep secret)
 *   TWILIO_VERIFY_SERVICE_SID=VA...      Twilio console > Verify > Services > create one
 *   MFA_SMS_PROVIDER=mock                TESTING ONLY. No text is sent and the code 123456
 *                                        is accepted. Never set this on a real site.
 *
 * In the Twilio console, under Verify > your service > Settings (and Messaging > Geo
 * permissions), allow only the United States and Canada so nobody can run up charges
 * by asking for codes to other countries.
 */
const TIMEOUT_MS = 10000;
// Tests point this at a local fake (tests/twilio-request.js); leave it unset for the real service.
const base = () => (process.env.TWILIO_VERIFY_BASE || 'https://verify.twilio.com').replace(/\/$/, '');
const MOCK_CODE = '123456';

const isMock = () => String(process.env.MFA_SMS_PROVIDER || '').toLowerCase() === 'mock';
const configured = () => isMock() || Boolean(
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID);

/**
 * US and Canada numbers only (+1, area code and exchange start with 2-9).
 * Returns the number as +1XXXXXXXXXX, or null if it is not one.
 * Accepts "(702) 555-0123", "702-555-0123", "+1 702 555 0123", "17025550123".
 */
function normalizePhone(input) {
  const digits = String(input || '').replace(/[^0-9]/g, '');
  const ten = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (!/^[2-9][0-9]{2}[2-9][0-9]{6}$/.test(ten)) return null;
  return `+1${ten}`;
}

async function twilio(path, form) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: ctrl.signal,
    });
    let json = {}; try { json = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, json };
  } finally { clearTimeout(timer); }
}

/** Sends a code. Returns { ok:true } or { ok:false, reason } where reason is 'not_configured' | 'rate_limited' | 'failed'. */
async function startVerification(phone) {
  if (isMock()) return { ok: true };
  if (!configured()) return { ok: false, reason: 'not_configured' };
  try {
    const r = await twilio('Verifications', { To: phone, Channel: 'sms' });
    if (r.status === 201 || r.status === 200) return { ok: true };
    if (r.status === 429) return { ok: false, reason: 'rate_limited' };
    return { ok: false, reason: 'failed' };
  } catch { return { ok: false, reason: 'failed' }; }
}

/** Checks a code. true only if Twilio says it is approved. */
async function checkVerification(phone, code) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!/^[0-9]{4,10}$/.test(c)) return false;
  if (isMock()) return c === MOCK_CODE;
  if (!configured()) return false;
  try {
    const r = await twilio('VerificationCheck', { To: phone, Code: c });
    return r.status === 200 && r.json.status === 'approved';
  } catch { return false; }
}

module.exports = { normalizePhone, startVerification, checkVerification, configured, isMock, MOCK_CODE };
