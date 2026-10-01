import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { postFetch } from '../utils/api';

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

  // ── Sign in → POST /auth/signin ───────────────────────────────────────────
  const handleLogIn = useCallback(async () => {
    const { userName, password } = user;
    if (!userName || !password) {
      dispatch({ type: 'UPDATE_USER', payload: { loginError: 'Enter username and password' } });
      return null;
    }

    const data = await postFetch('/auth/signin', { userName, password });

    if (!data) {
      dispatch({ type: 'UPDATE_USER', payload: { loginError: 'Server unreachable' } });
      return null;
    }
    if (data.error) {
      dispatch({ type: 'UPDATE_USER', payload: { loginError: data.error } });
      return null;
    }

    // Server returns { results: [user], token }
    const loggedInUser = data.results[0];
    // Persist session so page refresh keeps user logged in
    sessionStorage.setItem('oe_token', data.token);
    sessionStorage.setItem('oe_user', JSON.stringify(loggedInUser));
    dispatch({ type: 'SET_TOKEN',   payload: data.token });
    dispatch({ type: 'UPDATE_USER', payload: { ...loggedInUser, isLogedIn: true, loginError: '' } });
    return loggedInUser;
  }, [user, dispatch]);

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

  return { handleUser, handleLogIn, handleRegister, handleLogOut };
}
