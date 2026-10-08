/**
 * utils/totp.js
 *
 * Time-based one-time passwords (RFC 6238, the kind Google Authenticator,
 * Microsoft Authenticator, Authy and 1Password produce): 6 digits, 30 seconds,
 * HMAC-SHA1. Uses only Node's crypto, no extra package.
 *
 * Also encrypts the shared secret for storage (AES-256-GCM). Key: MFA_KEY in
 * .env, else JWT_SECRET. Set a long random MFA_KEY; if it changes, enrolled
 * users can no longer sign in with codes (use a recovery code, then re-enrol).
 */
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0, value = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/=+$/, '')) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('bad base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

const generateSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}

const counterAt = (ms = Date.now()) => Math.floor(ms / 1000 / 30);

/**
 * Returns the matching time-step counter (so the caller can refuse to accept the
 * same step twice) or null. Accepts one step either side for clock drift.
 */
function verifyTotp(secret, code, lastCounter = 0, ms = Date.now()) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!/^[0-9]{6}$/.test(c)) return null;
  const now = counterAt(ms);
  for (const step of [0, -1, 1]) {
    const counter = now + step;
    const a = Buffer.from(hotp(secret, counter)), b = Buffer.from(c);
    if (counter > Number(lastCounter) && crypto.timingSafeEqual(a, b)) return counter;
  }
  return null;
}

const otpauthUri = (secret, account, issuer = 'OwenEnterprises') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

const key = () => crypto.createHash('sha256')
  .update(process.env.MFA_KEY || process.env.JWT_SECRET || 'owenenterprises_secret_change_in_prod').digest();

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

function decryptSecret(stored) {
  const [iv, tag, enc] = String(stored).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

module.exports = { generateSecret, verifyTotp, hotp, counterAt, otpauthUri, encryptSecret, decryptSecret, base32Encode, base32Decode };
