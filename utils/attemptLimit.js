/**
 * utils/attemptLimit.js
 *
 * Small in-memory sliding-window limiter (a server restart clears it, like the
 * limits in routes/mfa.js).
 *
 *   const lim = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
 *   lim.locked('u7')    -> minutes to wait (0 = allowed). Locked once `max`
 *                          failures happened inside the last windowMs.
 *   lim.miss('u7')      -> record a failure
 *   lim.clear('u7')     -> forget the key (after a success)
 *
 * Used by routes/church.js for wrong join codes and for wrong passwords when
 * handing a church over. Callers namespace the keys ('u7', 'ip1.2.3.4').
 */
function makeLimiter({ max, windowMs }) {
  const map = new Map();   // key -> [timestamps of failures]
  const recent = (key) => {
    const now = Date.now();
    const list = (map.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length) map.set(key, list); else map.delete(key);
    return list;
  };
  return {
    locked(key) {
      const list = recent(key);
      if (list.length < max) return 0;
      const freeAt = list[list.length - max] + windowMs;   // when the oldest counted failure expires
      return Math.max(1, Math.ceil((freeAt - Date.now()) / 60000));
    },
    miss(key) {
      const list = recent(key);
      list.push(Date.now());
      map.set(key, list);
      if (map.size > 5000) for (const k of map.keys()) recent(k);   // drop idle keys
    },
    clear(key) { map.delete(key); },
    reset() { map.clear(); },
  };
}
module.exports = { makeLimiter };
