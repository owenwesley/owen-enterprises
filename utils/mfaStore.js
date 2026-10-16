/**
 * utils/mfaStore.js  (1.13.7)
 *
 * Short-lived state for two-step sign-in, in Redis when REDIS_URL is set, otherwise in this
 * process's memory. Three jobs:
 *
 *   claimTimeStep(userId, step)   anti-replay: true only the FIRST time a TOTP step is claimed
 *   lockRemainingMs / recordFailure / clearFailures
 *                                 brute-force lockout: MFA_MAX_ATTEMPTS wrong codes (default 5)
 *                                 -> locked MFA_LOCK_MINUTES (default 15)
 *   rateLimitStore(name)          a store for express-rate-limit (per-IP limit on the verify route)
 *
 * With Redis the state survives an app restart (the weekly rebuild, a Plesk restart) and is
 * shared by several app processes. Without Redis the LOCKOUT counters live in MySQL (table
 * mfa_lockout, 1.13.8), so they also survive a restart and are shared by every process.
 * Only if MySQL itself cannot be reached does a call fall back to this process's memory.
 *
 * If Redis is configured but down, every call falls back to memory for that call and says so in
 * the log (throttled): sign-in keeps working and still has limits, just per process.
 * The replay rule does NOT depend on this file alone: routes/mfa.js also records the last
 * accepted time step in MySQL (user_mfa.lastCounter) with an atomic UPDATE, which is what keeps
 * a code single-use even when Redis is absent or down.
 *
 * HIPAA Security Rule: 45 CFR 164.312(d) authentication (a code cannot be reused),
 * 164.308(a)(5)(ii)(C) log-in monitoring / lockout after repeated failures.
 *
 * Keys hold only the numeric user id, a time step and counters - never a code or a secret.
 * They all expire on their own.
 */
const { MemoryStore } = require('express-rate-limit');

const num = (name, dflt) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};
const MAX_FAILURES = () => num('MFA_MAX_ATTEMPTS', 5);
const LOCK_MS = () => num('MFA_LOCK_MINUTES', 15) * 60 * 1000;
const FAIL_WINDOW_MS = () => LOCK_MS();                 // failures older than this are forgotten
const CLAIM_TTL_MS = 2 * 60 * 1000;                     // longer than any code stays valid (about 90 s)
const MEM_CAP = 20000;

// ── Redis connection (optional) ──────────────────────────────────────────────
let client = null;
let wantRedis = null;          // decided on first use so .env is already loaded
let lastLogAt = 0;
const logOnce = (msg) => {     // at most one line a minute, so an outage cannot flood the log
  if (Date.now() - lastLogAt > 60 * 1000) { lastLogAt = Date.now(); console.error(`[mfa-store] ${msg}`); }
};
const prefix = () => process.env.REDIS_PREFIX || 'oe:mfa:';

const LUA_FAIL = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local locked = 0
if n >= tonumber(ARGV[2]) then redis.call('SET', KEYS[2], '1', 'PX', ARGV[3]); locked = 1 end
return {n, locked}`;
const LUA_HIT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {n, redis.call('PTTL', KEYS[1])}`;

function redis() {
  if (wantRedis === null) wantRedis = Boolean(process.env.REDIS_URL);
  if (!wantRedis) return null;
  if (!client) {
    const Redis = require('ioredis');
    client = new Redis(process.env.REDIS_URL, {
      // Fail fast instead of queueing commands while Redis is away: we have a memory fallback.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 1500,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    client.on('error', (e) => logOnce(`Redis error: ${e.message} (using memory until it is back)`));
    client.on('ready', () => console.log('[mfa-store] Redis connected'));
  }
  return client.status === 'ready' ? client : null;
}

/** Runs fn(redisClient); on no Redis or any Redis error runs the memory version instead. */
async function withRedis(fn, fallback) {
  const r = redis();
  if (r) {
    try { return await fn(r); }
    catch (e) { logOnce(`Redis command failed: ${e.message} (using memory)`); }
  }
  return fallback();
}

const mode = () => (redis() ? 'redis' : 'mysql');

// ── MySQL (the lockout store when there is no Redis) ─────────────────────────
const dbp = () => require('../db/db').owenenterprises.promise();

/** Runs sql(promisePool); on any MySQL error logs once a minute and runs the memory version instead. */
async function withDb(sql, fallback) {
  try { return await sql(dbp()); }
  catch (e) { logOnce(`MySQL lockout store failed: ${e.message} (using memory)`); return fallback(); }
}

/** Start connecting now (server.js calls this at boot). Does nothing without REDIS_URL. */
const init = () => { redis(); };

// ── memory fallback ──────────────────────────────────────────────────────────
const mem = { claims: new Map(), fails: new Map(), locks: new Map() };
function sweep(map) {
  if (map.size <= MEM_CAP) return;
  const now = Date.now();
  for (const [k, v] of map) if ((v.until || v) <= now) map.delete(k);
  if (map.size > MEM_CAP) map.clear();                  // last resort; limits restart from zero
}

// ── anti-replay ──────────────────────────────────────────────────────────────
const claimKey = (userId, step) => `${prefix()}otp:${userId}:${step}`;

/** true = first use of this time step by this user; false = it was already used (a replay). */
function claimTimeStep(userId, step) {
  return withRedis(
    async (r) => (await r.set(claimKey(userId, step), '1', 'PX', CLAIM_TTL_MS, 'NX')) === 'OK',
    () => {
      const k = claimKey(userId, step), now = Date.now();
      const until = mem.claims.get(k);
      if (until && until > now) return false;
      mem.claims.set(k, now + CLAIM_TTL_MS);
      sweep(mem.claims);
      return true;
    });
}

// ── lockout ──────────────────────────────────────────────────────────────────
const failKey = (userId) => `${prefix()}fail:${userId}`;
const lockKey = (userId) => `${prefix()}lock:${userId}`;

/** Milliseconds this user must still wait (0 = allowed to try). */
function lockRemainingMs(userId) {
  return withRedis(
    async (r) => Math.max(0, await r.pttl(lockKey(userId))),     // -2 no key, -1 no expiry: both -> 0 / never
    () => withDb(async (db) => {
      const [rows] = await db.query('SELECT lockedUntil FROM mfa_lockout WHERE user_id=?', [userId]);
      return Math.max(0, (rows && rows[0] ? Number(rows[0].lockedUntil) : 0) - Date.now());
    }, () => Math.max(0, (mem.locks.get(String(userId)) || 0) - Date.now())));
}

/** Records one wrong code. Returns { count, locked } (locked = this failure reached the limit). */
function recordFailure(userId) {
  const max = MAX_FAILURES();
  return withRedis(
    async (r) => {
      const [count, locked] = await r.eval(LUA_FAIL, 2, failKey(userId), lockKey(userId),
        FAIL_WINDOW_MS(), max, LOCK_MS());
      return { count, locked: locked === 1 };
    },
    () => withDb(async (db) => {
      // One atomic upsert. MySQL/MariaDB apply the SET list left to right, so failCount and windowEnd are
      // already updated when lockedUntil is worked out.
      const now = Date.now();
      await db.query(
        `INSERT INTO mfa_lockout (user_id, failCount, windowEnd, lockedUntil) VALUES (?, 1, ?, 0)
         ON DUPLICATE KEY UPDATE
           failCount   = IF(windowEnd <= ?, 1, failCount + 1),
           windowEnd   = IF(windowEnd <= ?, ?, windowEnd),
           lockedUntil = IF(failCount >= ?, ?, lockedUntil)`,
        [userId, now + FAIL_WINDOW_MS(), now, now, now + FAIL_WINDOW_MS(), max, now + LOCK_MS()]);
      const [rows] = await db.query('SELECT failCount FROM mfa_lockout WHERE user_id=?', [userId]);
      const count = rows && rows[0] ? Number(rows[0].failCount) : 1;
      return { count, locked: count >= max };
    }, () => memFailure(userId, max)));
}

function memFailure(userId, max) {
  const id = String(userId), now = Date.now();
  let f = mem.fails.get(id);
  if (!f || f.until <= now) f = { n: 0, until: now + FAIL_WINDOW_MS() };
  f.n += 1;
  mem.fails.set(id, f);
  sweep(mem.fails);
  const locked = f.n >= max;
  if (locked) mem.locks.set(id, now + LOCK_MS());
  return { count: f.n, locked };
}

/** After a correct code: forget the failures (and any lock, which a correct code cannot reach anyway). */
function clearFailures(userId) {
  return withRedis(
    (r) => r.del(failKey(userId), lockKey(userId)),
    () => withDb((db) => db.query('DELETE FROM mfa_lockout WHERE user_id=?', [userId]),
      () => {}).then(() => { mem.fails.delete(String(userId)); mem.locks.delete(String(userId)); }));
}

// ── express-rate-limit store ─────────────────────────────────────────────────
/**
 * Use as `rateLimit({ store: rateLimitStore('mfaverify'), ... })`. Needs one instance per limiter.
 * Redis when available; otherwise the library's own in-memory store.
 */
function rateLimitStore(name) {
  const fallback = new MemoryStore();
  let windowMs = 60000;
  const key = (k) => `${prefix()}rl:${name}:${k}`;
  return {
    localKeys: false,
    init(options) { windowMs = options.windowMs; fallback.init(options); },
    async increment(k) {
      return withRedis(
        async (r) => {
          const [hits, ttl] = await r.eval(LUA_HIT, 1, key(k), windowMs);
          return { totalHits: hits, resetTime: new Date(Date.now() + (ttl > 0 ? ttl : windowMs)) };
        },
        () => fallback.increment(k));
    },
    async decrement(k) {
      return withRedis(
        async (r) => { if ((await r.decr(key(k))) < 0) await r.set(key(k), '0', 'PX', windowMs); },
        () => fallback.decrement(k));
    },
    async resetKey(k) { return withRedis((r) => r.del(key(k)), () => fallback.resetKey(k)); },
  };
}

/** Closes the Redis connection (tests, graceful shutdown). */
async function close() {
  if (client) { try { await client.quit(); } catch { client.disconnect(); } client = null; }
  wantRedis = null;
}

module.exports = {
  claimTimeStep, lockRemainingMs, recordFailure, clearFailures, rateLimitStore, mode, init, close,
  MAX_FAILURES, LOCK_MS,
};
