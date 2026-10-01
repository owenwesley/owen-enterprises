import React, { useState } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import { useAppContext } from '../context/AppContext';
import { useProfile, validateProfile } from '../hooks/useProfile';

const sxStyles = {
  // Fills the space the app shell gives it and scrolls internally (see README
  // "Layout rule"). `my: 'auto'` on the card centres it without ever pushing
  // the top out of reach on short screens.
  wrapper: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: { xs: '16px 12px', sm: '24px' },
    boxSizing: 'border-box',
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    my: 'auto',
    borderRadius: 4,
    padding: { xs: '24px 18px', sm: '32px 32px' },
    display: 'flex',
    flexDirection: 'column',
    gap: 1.75,
    boxSizing: 'border-box',
  },
  header:  { fontWeight: 800, color: '#1a237e', fontSize: '1.4rem' },
  sub:     { color: '#666', fontSize: '0.9rem', marginTop: -0.5 },
  section: { fontWeight: 700, color: '#1a237e', fontSize: '0.95rem', marginTop: 0.5 },
  hint:    { color: '#666', fontSize: '0.8rem', marginTop: -1 },
  row:     { display: 'flex', gap: 1.75, flexDirection: { xs: 'column', sm: 'row' } },
  btn:     { marginTop: 1, background: '#1a237e', color: '#fff', borderRadius: 2,
             '&:hover': { background: '#283593' } },
  serverErr: { color: '#b71c1c', fontSize: '0.85rem', textAlign: 'center' },
};

const EMPTY_PW = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function ProfilePage() {
  const { state } = useAppContext();
  const { user } = state;
  const { saveProfile } = useProfile();

  // Local copy so typing never touches the global store until Save.
  const [form, setForm] = useState({
    firstName: user.firstName || '', lastName: user.lastName || '',
    userName:  user.userName  || '', email:    user.email    || '',
    ...EMPTY_PW,
  });
  const [errors, setErrors]     = useState({});
  const [serverErr, setServerErr] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((er) => ({ ...er, [name]: '' }));
    setServerErr('');
    setSaved(false);
  };

  const onSave = async () => {
    const found = validateProfile(form);
    if (Object.keys(found).length) { setErrors(found); return; }

    setSaving(true);
    const result = await saveProfile(form);
    setSaving(false);

    if (!result.ok) {
      setErrors(result.fieldErrors);
      // Field errors are shown under their field; only show the banner when
      // the failure isn't tied to one.
      setServerErr(Object.keys(result.fieldErrors).length ? '' : result.error);
      return;
    }
    setErrors({});
    setServerErr('');
    setForm((f) => ({ ...f, ...EMPTY_PW }));
    setSaved(true);
  };

  const onKey = (e) => { if (e.key === 'Enter' && !saving) onSave(); };

  const field = (label, name, type = 'text', extra = {}) => (
    <TextField
      label={label} name={name} type={type} value={form[name]}
      variant="outlined" size="small" fullWidth
      onChange={onChange} onKeyDown={onKey}
      error={!!errors[name]} helperText={errors[name] || ' '}
      FormHelperTextProps={{ sx: { marginTop: 0, minHeight: '1.1em' } }}
      {...extra}
    />
  );

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Typography sx={sxStyles.header}>My Profile</Typography>
        <Typography sx={sxStyles.sub}>Update your account details.</Typography>

        <Box sx={sxStyles.row}>
          {field('First Name', 'firstName', 'text', { autoComplete: 'given-name' })}
          {field('Last Name',  'lastName',  'text', { autoComplete: 'family-name' })}
        </Box>
        {field('Username', 'userName', 'text',  { autoComplete: 'username' })}
        {field('Email',    'email',    'email', { autoComplete: 'email' })}

        <Divider />
        <Typography sx={sxStyles.section}>Change password</Typography>
        <Typography sx={sxStyles.hint}>Leave these blank to keep your current password.</Typography>

        {field('Current Password', 'currentPassword', 'password', { autoComplete: 'current-password' })}
        <Box sx={sxStyles.row}>
          {field('New Password',     'newPassword',     'password', { autoComplete: 'new-password' })}
          {field('Confirm Password', 'confirmPassword', 'password', { autoComplete: 'new-password' })}
        </Box>

        {serverErr && <Typography sx={sxStyles.serverErr}>{serverErr}</Typography>}

        <Button sx={sxStyles.btn} variant="contained" fullWidth onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </Paper>

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message="Profile updated"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  );
}
