/**
 * utils/totp.js  (1.13.7)
 *
 * Time-based one-time passwords (RFC 6238 - what Google Authenticator, Microsoft Authenticator, Authy,
 * 1Password and Bitwarden make): 6 digits, 30-second steps, HMAC-SHA1 (the setting every authenticator
 * app supports). The maths is done by `otplib`; this file adds the three things the app needs on top:
 *
 *   1. input hygiene: a code that is not exactly 6 digits is "not valid", never an exception;
 *   2. the matched TIME STEP, so the caller can refuse to accept the same step twice (anti-replay,
 *      routes/mfa.js + utils/mfaStore.js);
 *   3. storing the shared secret encrypted (AES-256-GCM, utils/mfaCrypto.js).
 *
 * HIPAA Security Rule: 45 CFR 164.312(d) person or entity authentication (a code only the holder of the
 * enrolled device can make), 164.312(a)(2)(iv) encryption of the secret at rest.
 */
const otplib = require('otplib');
const mfaCrypto = require('./mfaCrypto');

const PERIOD = 30;                 // seconds per code
const DIGITS = 6;
const DRIFT_STEPS = 1;             // accept one step either side for a phone clock that is a little off
const ISSUER = process.env.MFA_ISSUER || 'OwenEnterprises';
const PURPOSE = 'totp-secret';     // AAD label: a phone-number ciphertext can never pass as a secret

/** New random shared secret: 160 bits, 32 base32 characters (what the QR code and the typed key carry). */
const generateSecret = () => otplib.generateSecret();

const timeStepAt = (ms = Date.now()) => Math.floor(ms / 1000 / PERIOD);

/** The 6-digit code for the instant `ms`. */
const codeAt = (secret, ms = Date.now()) => otplib.generateSync({ secret, epoch: Math.floor(ms / 1000) });

/**
 * Checks a typed code. Never throws.
 * @returns {{valid: false} | {valid: true, delta: number, step: number}}
 *   delta = -1 / 0 / +1 (which step the phone was on); step = the absolute time step the code belongs to.
 * The comparison inside otplib is constant-time.
 */
function checkCode(secret, code, ms = Date.now()) {
  if (typeof code !== 'string' && typeof code !== 'number') return { valid: false };
  const token = String(code).replace(/\s+/g, '');
  if (!/^[0-9]{6}$/.test(token)) return { valid: false };
  try {
    const r = otplib.verifySync({ secret, token, epoch: Math.floor(ms / 1000), epochTolerance: DRIFT_STEPS * PERIOD });
    return r.valid ? { valid: true, delta: r.delta, step: r.timeStep } : { valid: false };
  } catch { return { valid: false }; }
}

/** The link inside the QR code. Issuer, algorithm, digits and period are spelled out for picky apps. */
function otpauthUri(secret, account, issuer = ISSUER) {
  return `${otplib.generateURI({ issuer, label: account, secret })}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
}

const encryptSecret = (plain) => mfaCrypto.encrypt(plain, PURPOSE);
const decryptSecret = (stored) => mfaCrypto.decrypt(stored, PURPOSE);

// ── kept for db/mfaCheck.js and the older tests (counter = time step) ─────────────────────────────
const counterAt = timeStepAt;
const hotp = (secret, counter) => codeAt(secret, counter * PERIOD * 1000);

module.exports = {
  generateSecret, codeAt, checkCode, timeStepAt, otpauthUri, encryptSecret, decryptSecret,
  counterAt, hotp, PERIOD, DIGITS,
};
