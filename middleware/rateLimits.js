/**
 * middleware/rateLimits.js  (1.11.29)
 *
 * Per-IP / per-user request limits (express-rate-limit, in memory: a restart clears
 * them, and each server process counts separately - if you ever run several
 * processes behind a load balancer, give express-rate-limit a shared store).
 *
 *   signin   10 failed sign-ins per IP per 15 min (successful ones are not counted)
 *   signup   10 sign-ups per IP per hour
 *   mfa      15 code sends/verifies per IP per 15 min (routes/mfa.js also has its own per-user limits)
 *   borrow   30 borrow requests per signed-in user per hour
 *   api      1200 requests per IP per 5 min across the whole API (a backstop, far above normal use)
 *
 * Every number can be changed in .env:
 *   RATE_LIMIT_SIGNIN_MAX, RATE_LIMIT_SIGNUP_MAX, RATE_LIMIT_MFA_MAX,
 *   RATE_LIMIT_BORROW_MAX, RATE_LIMIT_API_MAX
 * RATE_LIMIT=off turns every limit off (the automated checks use it).
 *
 * IMPORTANT behind a reverse proxy / host that terminates HTTPS: every visitor then looks
 * like the proxy's one IP unless Express trusts the proxy's X-Forwarded-For header. Set
 * TRUST_PROXY=1 (number of proxy hops) in .env. server.js also does this when FORCE_HTTPS is on.
 */
const rateLimit = require('express-rate-limit');

const off = String(process.env.RATE_LIMIT || '').toLowerCase() === 'off';
const num = (name, dflt) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};
const noop = (req, res, next) => next();

function make({ windowMs, max, message, keyGenerator, skipSuccessfulRequests }) {
  if (off) return noop;
  return rateLimit({
    windowMs, max, skipSuccessfulRequests: !!skipSuccessfulRequests,
    standardHeaders: 'draft-7', legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res) => {
      const retry = Math.max(1, Math.ceil((res.getHeader('Retry-After') || windowMs / 1000) / 60));
      res.status(429).json({ error: `${message} Try again in about ${retry} minute(s).` });
    },
  });
}

const MIN = 60 * 1000;
module.exports = {
  signin: make({ windowMs: 15 * MIN, max: num('RATE_LIMIT_SIGNIN_MAX', 10), skipSuccessfulRequests: true,
    message: 'Too many failed sign-in attempts.' }),
  signup: make({ windowMs: 60 * MIN, max: num('RATE_LIMIT_SIGNUP_MAX', 10),
    message: 'Too many accounts created from this address.' }),
  mfa: make({ windowMs: 15 * MIN, max: num('RATE_LIMIT_MFA_MAX', 15),
    message: 'Too many verification attempts.' }),
  borrow: make({ windowMs: 60 * MIN, max: num('RATE_LIMIT_BORROW_MAX', 30),
    keyGenerator: (req) => `u${req.user && req.user.id}`,
    message: 'You are sending borrow requests too quickly.' }),
  api: make({ windowMs: 5 * MIN, max: num('RATE_LIMIT_API_MAX', 1200),
    message: 'Too many requests.' }),
};
