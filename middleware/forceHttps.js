/**
 * middleware/forceHttps.js
 *
 * Makes sure health data only travels over HTTPS. Does nothing unless
 * FORCE_HTTPS=on in .env, so local use on http://localhost keeps working.
 *
 * Turn it on when the app is served through something that ends HTTPS in front
 * of Node (a host's load balancer, Cloudflare, nginx, Caddy). Those tell Node
 * the original scheme in the X-Forwarded-Proto header, so server.js sets
 * `trust proxy` when this is on. Plain-HTTP requests to /api-style paths get 403;
 * page requests are redirected to https. Every response carries HSTS so browsers
 * stay on HTTPS afterwards.
 *
 * The redirect is temporary (307) on purpose: browsers keep a 301 for good, which would
 * keep sending people to https after the setting is turned off. http://localhost is exempt.
 *
 * It does NOT create a certificate: HTTPS itself has to be set up at your host.
 */
const on = () => String(process.env.FORCE_HTTPS || '').trim().toLowerCase() === 'on';

// Local use never has a certificate, so http://localhost is always left alone.
const isLocal = (host) => /^(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$/i.test(String(host || ''));

module.exports = function forceHttps(req, res, next) {
  if (!on() || isLocal(req.headers.host)) return next();
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    return next();
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const accepts = String(req.headers.accept || '');
    if (accepts.includes('text/html')) return res.redirect(307, `https://${req.headers.host}${req.originalUrl}`);
  }
  return res.status(403).json({ error: 'HTTPS is required' });
};
module.exports.isOn = on;
