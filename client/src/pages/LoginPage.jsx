import React, { useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../hooks/useAuth';

const sxStyles = {
  // Fills the space the app shell gives it and scrolls internally, so the card
  // can't be clipped on short viewports (landscape phone, on-screen keyboard).
  wrapper: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    boxSizing: 'border-box',
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
  },
  card: {
    padding: { xs: '28px 20px', sm: '40px 36px' },
    width: '100%',
    maxWidth: 360,
    margin: 'auto', // centers when there is room; stays reachable when there isn't
    borderRadius: 4, // Updated to Material-UI theme spacing units (16px)
    display: 'flex',
    flexDirection: 'column',
    gap: 2, // MUI gap spacing unit
  },
  sub:   { color: '#555', textAlign: 'center', marginBottom: 1 },
  btn:   { marginTop: 1, background: '#1a237e', color: '#fff',
           '&:hover': { background: '#283593' } },
  link:  { textAlign: 'center', marginTop: 1 },
  err:   { color: '#b71c1c', fontSize: '0.85rem', textAlign: 'center' },
  ok:    { color: '#1b5e20', fontSize: '0.85rem', textAlign: 'center' },
};

export default function LoginPage() {
  const history = useHistory();
  const location = useLocation();
  const { state } = useAppContext();
  const registered = location.state && location.state.registered;
  const { handleUser, handleLogIn, handleMfaVerify, resendMfaText, cancelMfa } = useAuth();
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);
  const step2 = Boolean(state.user.mfaRequired);

  const onLogin = async () => {
    const result = await handleLogIn();
    if (result) history.push('/');
  };

  const onVerify = async () => {
    const result = await handleMfaVerify(code, remember);
    if (result) history.push('/');
  };

  const onKey = (e) => { if (e.key === 'Enter') onLogin(); };
  const onKeyCode = (e) => { if (e.key === 'Enter') onVerify(); };

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        {step2 ? (
          <>
            <Typography sx={sxStyles.sub}>
              {state.user.mfaMethod === 'sms'
                ? (state.user.mfaNotice || 'Enter the code we texted to your phone, or a recovery code.')
                : 'Enter the 6-digit code from your authenticator app, or a recovery code.'}
            </Typography>
            <TextField label="Code" name="mfaCode" variant="outlined" size="small" autoFocus
              value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKeyCode}
              inputProps={{ inputMode: 'text', autoComplete: 'one-time-code' }} fullWidth />
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
              <Checkbox id="remember-device" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <label htmlFor="remember-device">Remember this device for 30 days</label>
            </div>
            {state.user.loginError && (
              <Typography sx={sxStyles.err}>{state.user.loginError}</Typography>
            )}
            <Button sx={sxStyles.btn} variant="contained" fullWidth onClick={onVerify}>
              Verify
            </Button>
            {state.user.mfaMethod === 'sms' && (
              <Typography sx={sxStyles.link} variant="body2">
                <span style={{ color: '#1a237e', cursor: 'pointer', fontWeight: 600 }} onClick={resendMfaText}>
                  Send a new code
                </span>
              </Typography>
            )}
            <Typography sx={sxStyles.link} variant="body2">
              <span style={{ color: '#1a237e', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => { setCode(''); cancelMfa(); }}>
                Back
              </span>
            </Typography>
          </>
        ) : (
          <>
        <Typography sx={sxStyles.sub}>Sign in to continue</Typography>

        {registered && (
          <Typography sx={sxStyles.ok}>
            {registered === 'doctor'
              ? 'Account created. A doctor account has to be approved before you can view patients — you can sign in now to check its status.'
              : 'Account created. Sign in to continue.'}
          </Typography>
        )}

        <TextField label="Username" name="userName" variant="outlined" size="small"
          onChange={handleUser} onKeyDown={onKey} fullWidth />
        <TextField label="Password" name="password" type="password" variant="outlined"
          size="small" onChange={handleUser} onKeyDown={onKey} fullWidth />

        {state.user.loginError && (
          <Typography sx={sxStyles.err}>{state.user.loginError}</Typography>
        )}

        <Button sx={sxStyles.btn} variant="contained" fullWidth onClick={onLogin}>
          Sign In
        </Button>
        <Typography sx={sxStyles.link} variant="body2">
          Don't have an account?{' '}
          <span style={{ color: '#1a237e', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => history.push('/register')}>
            Register
          </span>
        </Typography>
          </>
        )}
      </Paper>
    </div>
  );
}
