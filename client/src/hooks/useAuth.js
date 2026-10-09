import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { postFetch } from '../utils/api';

// "Remember this device": a random token the server gave us after a good second step,
// kept per username in this browser and sent back with the password (server: utils/mfaDevices.js).
const DEVICE_KEY = 'oe_devices';
function readDevices() {
  try { return JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}') || {}; } catch { return {}; }
}
const getDeviceToken = (userName) => readDevices()[String(userName || '').toLowerCase()] || '';
function saveDeviceToken(userName, token) {
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify({ ...readDevices(), [String(userName || '').toLowerCase()]: token })); } catch { /* storage unavailable */ }
}
export function forgetDeviceToken(userName) {
  const all = readDevices(); delete all[String(userName || '').toLowerCase()];
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
}

export function useAuth() {
  const { state, dispatch } = useAppContext();
  const { user } = state;

  const handleUser = useCallback((e) => {
    dispatch({ type: 'UPDATE_USER', payload: { [e.target.name]: e.target.value } });
  }, [dispatch]);

  // ── Client-side validation for register ──────────────────────────────────────
  const validate = useCallback(() => {
    const { firstName, lastName, userName, password, email, role, licenseNumber } = user;
    let firstNameError = '', lastNameError = '', userNameError = '',
        passwordError  = '', emailError   = '', licenseNumberError = '';

    if (!firstName || firstName.length <= 3)
      firstNameError = 'First name must be at least 4 characters';
    if (!lastName  || lastName.length  <= 3)
      lastNameError  = 'Last name must be at least 4 characters';
    if (!userName  || userName.length  <= 3)
      userNameError  = 'Username must be at least 4 characters';
    if (!password)
      passwordError  = 'Password required';
    else if (password.length <= 5)
      passwordError  = 'Password must be at least 6 characters';
    else if (password.length >= 21)
      passwordError  = 'Password must be under 21 characters';
    else if (password.toLowerCase() === 'password')
      passwordError  = 'Cannot use "password" as your password';
    if (!email)
      emailError     = 'Email required';
    else if (!email.includes('@'))
      emailError     = 'Enter a valid email address';

    if (role === 'doctor' && !(licenseNumber || '').trim())
      licenseNumberError = 'License number required for doctor accounts';

    const hasErrors =
      firstNameError || lastNameError || userNameError || passwordError || emailError
      || licenseNumberError;
    if (hasErrors) {
      dispatch({ type: 'UPDATE_USER',
        payload: { firstNameError, lastNameError, userNameError, passwordError, emailError,
                   licenseNumberError } });
      return false;
    }
    return true;
  }, [user, dispatch]);

  // Stores a finished sign-in ({ results: [user], token }) exactly as before.
  const finishLogin = useCallback((data) => {
    const loggedInUser = data.results[0];
    // Persist session so page refresh keeps user logged in
    sessionStorage.setItem('oe_token', data.token);
    sessionStorage.setItem('oe_user', JSON.stringify(loggedInUser));
    dispatch({ type: 'SET_TOKEN',   payload: data.token });
    dispatch({ type: 'UPDATE_USER', payload: { ...loggedInUser, isLogedIn: true, loginError: '',
      mfaRequired: false, mfaToken: '', mfaNotice: '' } });
    return loggedInUser;
  }, [dispatch]);

  // ── Sign in → POST /auth/signin ───────────────────────────────────────────
  // Asks the server to text a (new) code. Used when step 2 opens and by "Send a new code".
  const sendMfaText = useCallback(async (mfaToken, phoneHint) => {
    const res = await postFetch('/auth/mfa/send', { mfaToken });
    if (res && res.sent) {
      dispatch({ type: 'UPDATE_USER', payload: { mfaNotice: `We texted a code to the phone ending in ${res.phoneHint || phoneHint || ''}.`, loginError: '' } });
    } else {
      dispatch({ type: 'UPDATE_USER', payload: { mfaNotice: '', loginError: (res && res.error) || 'The text could not be sent.' } });
    }
  }, [dispatch]);

  const handleLogIn = useCallback(async () => {
    const { userName, password } = user;
    if (!userName || !password) {
      dispatch({ type: 'UPDATE_USER', payload: { loginError: 'Enter username and password' } });
      return null;
    }

    const deviceToken = getDeviceToken(userName);
    const data = await postFetch('/auth/signin', { userName, password, ...(deviceToken ? { deviceToken } : {}) });

    if (!data) {
      dispatch({ type: 'UPDATE_USER', payload: { loginError: 'Server unreachable' } });
      return null;
    }
    if (data.error) {
      dispatch({ type: 'UPDATE_USER', payload: { loginError: data.error } });
      return null;
    }

    // Two-step sign-in: the password was right. Text messages get sent straight away.
    if (data.mfaRequired) {
      dispatch({ type: 'UPDATE_USER', payload: { mfaRequired: true, mfaToken: data.mfaToken,
        mfaMethod: data.mfaMethod, phoneHint: data.phoneHint || '', mfaNotice: '', loginError: '' } });
      if (data.mfaMethod === 'sms') await sendMfaText(data.mfaToken, data.phoneHint);
      return null;
    }
    return finishLogin(data);
  }, [user, dispatch, finishLogin, sendMfaText]);

  // ── Step 2 → POST /auth/mfa/verify (6-digit app code or a recovery code) ────
  const handleMfaVerify = useCallback(async (code, rememberDevice = false) => {
    if (!String(code || '').trim()) {
      dispatch({ type: 'UPDATE_USER', payload: { loginError: 'Enter the code' } });
      return null;
    }
    const data = await postFetch('/auth/mfa/verify', { mfaToken: user.mfaToken, code, rememberDevice: rememberDevice === true });
    if (!data) {
      dispatch({ type: 'UPDATE_USER', payload: { loginError: 'Server unreachable' } });
      return null;
    }
    if (data.error) {
      // An expired sign-in sends the person back to the password step.
      const expired = /expired/i.test(data.error);
      dispatch({ type: 'UPDATE_USER', payload: { loginError: data.error,
        ...(expired ? { mfaRequired: false, mfaToken: '' } : {}) } });
      return null;
    }
    if (data.deviceToken) saveDeviceToken(user.userName, data.deviceToken);
    return finishLogin(data);
  }, [user, dispatch, finishLogin]);

  // "Send a new code" on the second step.
  const resendMfaText = useCallback(() => sendMfaText(user.mfaToken, user.phoneHint), [user, sendMfaText]);

  // Back from the code step to the password step.
  const cancelMfa = useCallback(() => {
    dispatch({ type: 'UPDATE_USER', payload: { mfaRequired: false, mfaToken: '', mfaNotice: '', loginError: '' } });
  }, [dispatch]);

  // ── Register → POST /auth/signup ─────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    if (!validate()) return false;

    const { firstName, lastName, userName, password, email, licenseNumber, specialty } = user;
    // The server only ever grants 'doctor' as a *pending* request; anything
    // else registers as a patient.
    const role = user.role === 'doctor' ? 'doctor' : 'patient';
    const data = await postFetch('/auth/signup',
      { firstName, lastName, userName, password, email,
        role, ...(role === 'doctor' ? { licenseNumber, specialty } : {}) });

    if (!data) {
      dispatch({ type: 'UPDATE_USER', payload: { loginError: 'Server unreachable' } });
      return false;
    }
    if (data.error) {
      // Map server error back to the right field
      const lower = data.error.toLowerCase();
      if (lower.includes('license')) {
        dispatch({ type: 'UPDATE_USER', payload: { licenseNumberError: data.error } });
      } else if (lower.includes('username') || lower.includes('taken')) {
        dispatch({ type: 'UPDATE_USER', payload: { userNameError: data.error } });
      } else {
        dispatch({ type: 'UPDATE_USER', payload: { loginError: data.error } });
      }
      return false;
    }

    // Success — clear form state, return true so RegisterPage can redirect
    dispatch({ type: 'RESET' });
    return true;
  }, [user, validate, dispatch]);

  const handleLogOut = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  return { handleUser, handleLogIn, handleMfaVerify, resendMfaText, cancelMfa, handleRegister, handleLogOut };
}
