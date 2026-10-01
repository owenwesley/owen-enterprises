import React from 'react';
import { useHistory } from 'react-router-dom';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useAuth } from '../hooks/useAuth';
import { useAppContext } from '../context/AppContext';

const sxStyles = {
  wrapper: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 16px',
    boxSizing: 'border-box',
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
  },
  card: {
    padding: { xs: '20px 16px', sm: '24px 28px' },
    width: '100%',
    maxWidth: 420,
    maxHeight: 'calc(100vh - 24px)',
    overflowY: 'auto',
    borderRadius: 3,
    display: 'flex',
    flexDirection: 'column',
    gap: 1.25,
    boxSizing: 'border-box',
  },
  row: {
    display: 'flex',
    gap: 1.25,
    flexDirection: { xs: 'column', sm: 'row' },
  },
  fieldContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
  },
  sub: { color: '#555', textAlign: 'center', marginBottom: 0.5, fontWeight: 600 },
  btn: {
    marginTop: 0.5,
    background: '#1a237e',
    color: '#fff',
    '&:hover': { background: '#283593' },
  },
  link: { textAlign: 'center', marginTop: 0.5 },
  err: { color: '#b71c1c', fontSize: '0.75rem', marginTop: '2px' },
  serverErr: { color: '#b71c1c', fontSize: '0.85rem', textAlign: 'center' },
};

export default function RegisterPage() {
  const history = useHistory();
  const { state } = useAppContext();
  const { handleUser, handleRegister } = useAuth();
  const { dispatch } = useAppContext();
  const {
    firstNameError, lastNameError, userNameError,
    passwordError,  emailError,    loginError, licenseNumberError,
  } = state.user;
  const role = state.user.role === 'doctor' ? 'doctor' : 'patient';

  // Everyone registers the same way; role only matters for the BGTracker
  // doctor-linking feature, so it's an opt-in checkbox rather than a forced
  // choice — a Community Library or Meetings user shouldn't have to declare
  // themselves a "patient" just to sign up.
  const onDoctorToggle = (e) => {
    const isDoctor = e.target.checked;
    dispatch({
      type: 'UPDATE_USER',
      payload: {
        role: isDoctor ? 'doctor' : 'patient',
        licenseNumber: '', specialty: '', licenseNumberError: '',
      },
    });
  };

  const onRegister = async () => {
    const wasDoctor = role === 'doctor';   // read before handleRegister resets the form
    const success = await handleRegister();
    if (success) history.push('/login', { registered: wasDoctor ? 'doctor' : 'patient' });
  };

  const field = (label, name, type, errMsg) => (
    <Box sx={sxStyles.fieldContainer}>
      <TextField
        label={label} name={name} type={type || 'text'}
        variant="outlined" size="small"
        onChange={handleUser} fullWidth
        error={!!errMsg}
      />
      {errMsg && <Typography sx={sxStyles.err}>{errMsg}</Typography>}
    </Box>
  );

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Typography sx={sxStyles.sub} variant="h6">Create an account</Typography>

        <Box sx={sxStyles.row}>
          {field('First Name', 'firstName', 'text', firstNameError)}
          {field('Last Name',  'lastName',  'text', lastNameError)}
        </Box>

        {field('Username',   'userName',  'text',     userNameError)}
        {field('Password',   'password',  'password', passwordError)}
        {field('Email',      'email',     'email',    emailError)}

        <FormControlLabel
          control={<Checkbox checked={role === 'doctor'} onChange={onDoctorToggle} size="small" />}
          label={
            <Typography variant="body2">
              I'm a doctor signing up to view blood pressure, weight, and medication
              data patients share with me
            </Typography>
          }
        />

        {role === 'doctor' && (
          <>
            {field('License number',       'licenseNumber', 'text', licenseNumberError)}
            {field('Specialty (optional)', 'specialty',     'text')}
            <Typography variant="caption" sx={{ color: '#555' }}>
              Doctor accounts are reviewed before they can be used. You'll be able
              to sign in right away, but patient data stays locked until approval.
            </Typography>
          </>
        )}

        {loginError && (
          <Typography sx={sxStyles.serverErr}>{loginError}</Typography>
        )}

        <Button sx={sxStyles.btn} variant="contained" fullWidth onClick={onRegister}>
          Register
        </Button>

        <Typography sx={sxStyles.link} variant="body2">
          Already have an account?{' '}
          <span style={{ color: '#1a237e', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => history.push('/login')}>
            Sign In
          </span>
        </Typography>
      </Paper>
    </div>
  );
}
