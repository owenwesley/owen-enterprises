/**
 * utils/mfaCrypto.js  (1.13.7)
 *
 * Encrypts what two-step sign-in keeps in the database (TOTP secrets, phone numbers) with
 * AES-256-GCM, so a copy of the database alone is not enough to produce anyone's codes.
 *
 * HIPAA Security Rule: 45 CFR 164.312(a)(2)(iv) encryption of ePHI/credentials at rest
 * (addressable), 164.312(c)(1) integrity (GCM's authentication tag detects any change).
 *
 * Stored text:
 *   v2.<iv>.<tag>.<ciphertext>   (base64 parts) - written by this version
 *   <iv>.<tag>.<ciphertext>      - written by 1.11.20 - 1.13.6, still readable
 *
 * v2 adds "additional authenticated data" (AAD): a fixed purpose label such as 'totp-secret'.
 * It is not secret and not stored, but decryption fails unless the same label is given, so a
 * phone-number ciphertext can never be pasted into the secret column (or the other way round).
 * The AAD is deliberately NOT the user id: the weekly rebuild (db/maintenance) may renumber
 * users, and a secret bound to the old id would stop decrypting.
 *
 * Key: MFA_KEY (else JWT_SECRET) is hashed with SHA-256 to 32 bytes. This derivation is
 * unchanged since 1.11.20, so existing ciphertext still decrypts. Set a long random MFA_KEY
 * and keep it: if it changes, every enrolled secret/phone becomes unreadable (people then use
 * a recovery code and enrol again). A fresh 96-bit random IV is used for every encryption.
 */
const crypto = require('crypto');

const VERSION = 'v2';
const TAG_BYTES = 16;
const DEFAULT_KEY_TEXT = 'owenenterprises_secret_change_in_prod';

function keyBytes() {
  return crypto.createHash('sha256')
    .update(process.env.MFA_KEY || process.env.JWT_SECRET || DEFAULT_KEY_TEXT).digest();
}

/** True when neither MFA_KEY nor JWT_SECRET is set (server.js warns about this). */
const usingDefaultKey = () => !process.env.MFA_KEY && !process.env.JWT_SECRET;

/**
 * @param {string} plain    text to protect
 * @param {string} purpose  AAD label, e.g. 'totp-secret'
 */
function encrypt(plain, purpose) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv, { authTagLength: TAG_BYTES });
  if (purpose) cipher.setAAD(Buffer.from(String(purpose), 'utf8'));
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), enc]
    .map((part) => (Buffer.isBuffer(part) ? part.toString('base64') : part)).join('.');
}

/**
 * Throws if the text was changed, the key is wrong, or `purpose` differs from the one used to
 * encrypt (v2 only; the older 3-part text carries no AAD).
 */
function decrypt(stored, purpose) {
  const parts = String(stored).split('.');
  const isV2 = parts[0] === VERSION && parts.length === 4;
  if (!isV2 && parts.length !== 3) throw new Error('unrecognised ciphertext');
  const [iv, tag, enc] = (isV2 ? parts.slice(1) : parts).map((s) => Buffer.from(s, 'base64'));
  // Node would accept a shortened tag (down to 4 bytes) unless told the length: pin it to 16.
  if (iv.length !== 12 || tag.length !== TAG_BYTES) throw new Error('unrecognised ciphertext');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), iv, { authTagLength: TAG_BYTES });
  if (isV2 && purpose) decipher.setAAD(Buffer.from(String(purpose), 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt, usingDefaultKey, VERSION };
