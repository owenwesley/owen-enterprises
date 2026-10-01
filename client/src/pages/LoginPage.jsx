import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
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
  const { handleUser, handleLogIn } = useAuth();

  const onLogin = async () => {
    const result = await handleLogIn();
    if (result) history.push('/');
  };

  const onKey = (e) => { if (e.key === 'Enter') onLogin(); };

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
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
      </Paper>
    </div>
  );
}
