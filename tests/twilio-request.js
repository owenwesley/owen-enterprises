#!/usr/bin/env node
/**
 * tests/twilio-request.js  (npm run check:twilio)
 *
 * Checks utils/smsVerify.js against a LOCAL FAKE of Twilio Verify: that it calls the right
 * paths with HTTP Basic auth and the right form fields, and handles approved / denied /
 * rate-limited / failing / not-configured answers. Needs no database or server.
 * It does not prove the real Twilio account works; only the first real text does.
 */
const http = require('http');
let passed = 0, failed = 0;
const check = (l, c, d) => { c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}${d ? '  -> ' + d : ''}`)); };

const seen = [];
let mode = 'ok';
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers['content-type'], form: Object.fromEntries(new URLSearchParams(body)) });
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (mode === 'down') return send(500, { message: 'boom' });
    if (mode === 'limited') return send(429, { message: 'too many' });
    if (req.url.endsWith('/Verifications')) return send(201, { status: 'pending' });
    if (req.url.endsWith('/VerificationCheck')) return send(200, { status: mode === 'wrong' ? 'pending' : 'approved' });
    return send(404, {});
  });
});

server.listen(0, async () => {
  const port = server.address().port;
  process.env.TWILIO_VERIFY_BASE = `http://127.0.0.1:${port}`;
  delete process.env.MFA_SMS_PROVIDER;
  const sms = require('../utils/smsVerify');

  console.log('Twilio request check (local fake)');
  check('not configured -> not_configured', (await sms.startVerification('+17025550123')).reason === 'not_configured' && (await sms.checkVerification('+17025550123', '123456')) === false);
  check('configured() false without keys', sms.configured() === false);

  process.env.TWILIO_ACCOUNT_SID = 'ACtest'; process.env.TWILIO_AUTH_TOKEN = 'secret'; process.env.TWILIO_VERIFY_SERVICE_SID = 'VAtest';
  check('configured() true with keys', sms.configured() === true);

  let r = await sms.startVerification('+17025550123');
  const s = seen[0];
  check('start: ok', r.ok === true);
  check('start: POST /v2/Services/VAtest/Verifications', s.method === 'POST' && s.url === '/v2/Services/VAtest/Verifications', JSON.stringify(s));
  check('start: Basic auth sid:token', s.auth === 'Basic ' + Buffer.from('ACtest:secret').toString('base64'));
  check('start: form-encoded To and Channel=sms', /x-www-form-urlencoded/.test(s.type) && s.form.To === '+17025550123' && s.form.Channel === 'sms', JSON.stringify(s.form));

  check('check: approved -> true', (await sms.checkVerification('+17025550123', '123 456')) === true);
  const c = seen[1];
  check('check: POST .../VerificationCheck with To and Code (spaces removed)', c.url === '/v2/Services/VAtest/VerificationCheck' && c.form.To === '+17025550123' && c.form.Code === '123456', JSON.stringify(c));
  check('check: junk code never reaches Twilio', (await sms.checkVerification('+17025550123', 'abc')) === false && seen.length === 2);

  mode = 'wrong';  check('check: pending (wrong code) -> false', (await sms.checkVerification('+17025550123', '654321')) === false);
  mode = 'limited'; check('start: 429 -> rate_limited', (await sms.startVerification('+17025550123')).reason === 'rate_limited');
  mode = 'down';    check('start: 500 -> failed', (await sms.startVerification('+17025550123')).reason === 'failed');
  check('check: 500 -> false', (await sms.checkVerification('+17025550123', '123456')) === false);
  process.env.TWILIO_VERIFY_BASE = 'http://127.0.0.1:1';
  check('unreachable Twilio -> failed, no crash', (await sms.startVerification('+17025550123')).reason === 'failed');

  process.env.MFA_SMS_PROVIDER = 'mock';
  check('mock: accepts 123456 only and sends nothing', (await sms.checkVerification('+1', '123456')) === true && (await sms.checkVerification('+1', '111111')) === false);

  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
