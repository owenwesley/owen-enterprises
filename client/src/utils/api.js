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

function messageFor(res, body) {
  if (res.status === 401) return 'Your session has expired. Please sign in again.';
  if (res.status === 403) return 'You do not have permission to do that.';
  return (body && body.error) || `Request failed (HTTP ${res.status}).`;
}

async function request(method, url, body, label) {
  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok) report(url, messageFor(res, data));
    return data;
  } catch (err) {
    console.error(`${label} ${url} failed:`, err);
    report(url, 'Could not reach the server. Check your connection and try again.');
    return null;
  }
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
  try {
    const token = _getToken() || storedToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) report(url, messageFor(res, data));
    return data;
  } catch (err) {
    console.error(`POST (form-data) ${url} failed:`, err);
    report(url, 'Could not reach the server. Check your connection and try again.');
    return null;
  }
}
