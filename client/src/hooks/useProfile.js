import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { putFetch } from '../utils/api';

// Same rules as the register form (hooks/useAuth.js) and routes/auth.js.
// `password` fields are only checked when a new password was typed.
export function validateProfile(v) {
  const e = {};
  if (!v.firstName.trim() || v.firstName.trim().length <= 3) e.firstName = 'First name must be at least 4 characters';
  if (!v.lastName.trim()  || v.lastName.trim().length  <= 3) e.lastName  = 'Last name must be at least 4 characters';
  if (!v.userName.trim()  || v.userName.trim().length  <= 3) e.userName  = 'Username must be at least 4 characters';
  if (!v.email.trim()) e.email = 'Email required';
  else if (!v.email.includes('@')) e.email = 'Enter a valid email address';

  if (v.newPassword || v.confirmPassword) {
    if (v.newPassword.length <= 5)       e.newPassword = 'Password must be at least 6 characters';
    else if (v.newPassword.length >= 21) e.newPassword = 'Password must be under 21 characters';
    else if (v.newPassword.toLowerCase() === 'password') e.newPassword = 'Cannot use "password" as your password';
    else if (v.newPassword !== v.confirmPassword) e.confirmPassword = 'Passwords do not match';
    if (!v.currentPassword) e.currentPassword = 'Enter your current password to change it';
  }
  return e;
}

export function useProfile() {
  const { dispatch } = useAppContext();

  // Returns { ok: true } or { ok: false, error, fieldErrors }.
  const saveProfile = useCallback(async (v) => {
    const data = await putFetch('/auth/profile', {
      firstName: v.firstName, lastName: v.lastName,
      userName: v.userName,   email: v.email,
      ...(v.newPassword ? { newPassword: v.newPassword, currentPassword: v.currentPassword } : {}),
    });

    if (!data) return { ok: false, error: 'Server unreachable', fieldErrors: {} };
    if (data.error) return { ok: false, error: data.error, fieldErrors: data.fieldErrors || {} };

    // The server re-issues the token (it embeds the name fields). Keep the
    // stored session and the store in step so a refresh shows the new details.
    const updated = data.results[0];
    sessionStorage.setItem('oe_token', data.token);
    sessionStorage.setItem('oe_user', JSON.stringify(updated));
    dispatch({ type: 'SET_TOKEN', payload: data.token });
    // password: '' also clears anything typed on the login form that is still in the store.
    dispatch({ type: 'UPDATE_USER', payload: { ...updated, password: '' } });
    return { ok: true };
  }, [dispatch]);

  return { saveProfile };
}
