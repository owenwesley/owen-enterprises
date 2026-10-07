/**
 * db/mfaCheck.js - help when "that code is not right".
 *
 *   node db/mfaCheck.js <userName>            show what the server expects right now
 *   node db/mfaCheck.js <userName> <code>     test the code your phone shows: matches, or how far off
 *
 * Prints this computer's clock, whether the person has a pending/active
 * authenticator setup, and the code the SERVER expects right now (plus the
 * one just before and after). Compare with the phone: if one of the three
 * matches, the phone is a little off in time; if none match, the phone has a
 * different key (set it up again). Run it only on your own machine.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), quiet: true });
const mysql = require('mysql2/promise');
const totp = require('../utils/totp');

(async () => {
  const userName = process.argv[2];
  if (!userName) { console.log('Usage: node db/mfaCheck.js <userName>'); process.exit(1); }
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root', password: process.env.DB_PASS || '',
    database: process.env.DB_OWENENTERPRISES || 'owenenterprises',
  });
  const [rows] = await conn.query(
    'SELECT m.secretEnc, m.enabled, m.lastCounter FROM user_mfa m JOIN users u ON u.id = m.user_id WHERE u.userName = ?', [userName]);
  console.log(`This computer's time: ${new Date().toString()}  (UTC ${new Date().toISOString()})`);
  if (!rows.length) {
    console.log(`No authenticator setup for "${userName}". Click Turn on on the Two-step sign-in page first.`);
  } else {
    const secret = totp.decryptSecret(rows[0].secretEnc);
    const c = totp.counterAt();
    console.log(`Setup is ${rows[0].enabled ? 'ON' : 'started but NOT confirmed yet'}.`);
    console.log(`Server expects:  before ${totp.hotp(secret, c - 1)}   NOW ${totp.hotp(secret, c)}   next ${totp.hotp(secret, c + 1)}`);
    console.log(`Setup key the server has:  ${secret.replace(/(.{4})/g, '$1 ').trim()}`);
    console.log('The key on your phone must be exactly this one.');
    const phone = (process.argv[3] || '').replace(/\s+/g, '');
    if (phone) {
      let found = null;
      for (let d = -40; d <= 40 && found === null; d++) if (totp.hotp(secret, c + d) === phone) found = d;
      if (found === null) {
        console.log(`\nCode ${phone}: NO match anywhere within 20 minutes either side.`);
        console.log('So the phone has a different key. Delete the entry in the app and add it again with the Setup key above (time based).');
      } else if (Math.abs(found) <= 1) {
        console.log(`\nCode ${phone}: MATCHES (${found === 0 ? 'this moment' : found < 0 ? 'the step just before' : 'the next step'}). The key is right. Type the code on the page and click Confirm quickly.`);
      } else {
        console.log(`\nCode ${phone}: the key is RIGHT but the phone's clock is about ${Math.abs(found) * 30} seconds ${found < 0 ? 'behind' : 'ahead of'} this computer.`);
        console.log('Fix the phone clock (turn on automatic date and time), or in Google Authenticator use Settings > Time correction for codes > Sync now.');
      }
    }
  }
  await conn.end();
})().catch((e) => { console.log('Problem: ' + e.message); process.exit(1); });
