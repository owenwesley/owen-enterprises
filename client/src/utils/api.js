/**
 * Central API utility — automatically attaches JWT from AppContext.
 * Use getToken() to inject the token before every request.
 */

let _getToken = () => null;

/** Call this once at app startup to wire in the token getter. */
export function registerTokenGetter(fn) {
  _getToken = fn;
}

// The session token is also persisted in sessionStorage (see useAuth). Fall back
// to it: React runs a child's effects before its parent's, so a page opened
// directly or refreshed made its first request BEFORE NavBar had registered the
// token getter — no token, 401, and an empty table/chart until you navigated
// away and back.
function storedToken() {
  try { return sessionStorage.getItem('oe_token'); } catch { return null; }
}

function authHeaders() {
  const token = _getToken() || storedToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Error reporting ──────────────────────────────────────────────────────────
// Every failed request (network down, HTTP 4xx/5xx) is announced on window as
// an 'oe:api-error' event; <ApiErrorToast /> (mounted in App.jsx) shows it.
// Callers still get exactly what they got before (the parsed body, or null on
// a network failure), so no call site had to change. /auth/ calls are skipped:
// the login and register pages already show their own messages.
function report(url, message) {
  if (/^\/auth\//.test(url)) return;
  try { window.dispatchEvent(new CustomEvent('oe:api-error', { detail: { url, message } })); } catch { /* non-browser */ }
}

/** Show the standard error toast for a problem found on the client (e.g. a validation failure). */
export function notifyError(message) {
  report('', message);
}

// A 403 with one of these codes is not a plain "no permission": the server's HIPAA gate
// (middleware/hipaaGate.js) wants two-step sign-in or the consent forms first. The
// NavBar listens for 'oe:hipaa-required' and opens /consent instead of showing a toast.
// BGTRACKER_DISABLED on /bgtracker is expected for anyone with BGTracker switched off
// (the app loads readings at login for everybody), so it stays quiet there; on /doctor
// it means the doctor's or the patient's BGTracker is off, which is worth saying.
function reportFailure(url, res, data) {
  const code = data && data.code;
  if (res.status === 403 && (code === 'MFA_REQUIRED' || code === 'HIPAA_CONSENT_REQUIRED')) {
    try { window.dispatchEvent(new CustomEvent('oe:hipaa-required', { detail: { code } })); } catch { /* non-browser */ }
    return;
  }
  if (res.status === 403 && code === 'BGTRACKER_DISABLED') {
    if (/^\/doctor/.test(url)) report(url, 'BGTracker is turned off for you or for this patient, so this information is not available.');
    return;
  }
  report(url, messageFor(res, data));
}

function messageFor(res, body) {
  if (res.status === 401) return 'Your session has expired. Please sign in again.';
  if (res.status === 403) return 'You do not have permission to do that.';
  return (body && body.error) || `Request failed (HTTP ${res.status}).`;
}

// Reads the JSON body. When the server DID answer but not with JSON (an HTML error page from a proxy or an
// old server without the route, a size limit, a crash page) say so with the HTTP status, instead of the
// misleading "Could not reach the server".
async function readJson(res, url) {
  try { return await res.json(); }
  catch {
    report(url, `The server answered with something the app cannot read (HTTP ${res.status}). `
      + (res.status === 404 ? 'This server may not have the latest files, or was not restarted.'
        : res.status === 413 ? 'The upload was too large for the server.' : 'Try again; if it keeps happening, tell the site owner.'));
    return null;
  }
}

async function request(method, url, body, label) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: authHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    console.error(`${label} ${url} failed:`, err);
    report(url, 'Could not reach the server. Check your connection and try again.');
    return null;
  }
  const data = await readJson(res, url);
  if (data === null) return null;
  if (!res.ok) reportFailure(url, res, data);
  return data;
}

/** GET for background checks (badges): never shows an error toast. Returns the parsed body or null. */
export async function getQuiet(url) {
  try {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export const getFetch    = (url)       => request('GET',    url, undefined, 'GET');
export const postFetch   = (url, body) => request('POST',   url, body,      'POST');
export const putFetch    = (url, body) => request('PUT',    url, body,      'PUT');
export const deleteFetch = (url, body) => request('DELETE', url, body,      'DELETE');

/**
 * POST a FormData payload (file uploads). Do NOT set Content-Type manually —
 * the browser sets the correct multipart/form-data boundary automatically.
 * Only the Authorization header is attached.
 */
export async function postFormData(url, formData) {
  let res;
  try {
    const token = _getToken() || storedToken();
    res = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
  } catch (err) {
    console.error(`POST (form-data) ${url} failed:`, err);
    report(url, 'Could not reach the server. Check your connection and try again.');
    return null;
  }
  const data = await readJson(res, url);
  if (data === null) return null;
  if (!res.ok) reportFailure(url, res, data);
  return data;
}

/**
 * GET a protected picture and return a temporary object URL for <img src>. Pictures are never
 * served from a public folder: they need the sign-in header, which an <img src="/..."> cannot send,
 * so the page fetches the bytes itself. Returns null when it could not be loaded.
 * (The caller should URL.revokeObjectURL() the result when done; see components/AuthImage.jsx.)
 */
export async function getBlobUrl(url) {
  try {
    const token = _getToken() || storedToken();
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}
