import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import { useAppContext } from '../../context/AppContext';
import { deleteFetch } from '../../utils/api';

// Asks for the password and the word DELETE, then calls DELETE /auth/account.
// On success the session is cleared (RESET) and the router sends the person to
// the login page. The server decides who may delete (patients only for now).
export default function DeleteAccountDialog({ open, onClose }) {
  const { dispatch } = useAppContext();
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setPassword(''); setWord(''); setError('');
    onClose();
  };

  const canDelete = password.length > 0 && word.trim().toUpperCase() === 'DELETE' && !busy;

  const submit = async () => {
    if (!canDelete) return;
    setBusy(true); setError('');
    const data = await deleteFetch('/auth/account', { password });
    setBusy(false);
    if (!data) { setError('Could not reach the server. Nothing was deleted.'); return; }
    if (data.error) { setError(data.fieldErrors?.password || data.error); return; }
    dispatch({ type: 'RESET' });
  };

  // Enter in either box does the same as the red button, but only when it is enabled.
  const onEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle sx={{ color: '#b71c1c', fontWeight: 700 }}>Delete my account</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2, fontSize: '0.9rem' }}>
          This permanently deletes your account and everything in it: readings, blood pressure,
          weights, medications, nutrition, books, movies, contacts, meetings and any doctor
          links. It cannot be undone.
        </Typography>
        <TextField
          label="Your password" type="password" fullWidth size="small" autoComplete="current-password"
          autoFocus onKeyDown={onEnter}
          value={password} onChange={(e) => setPassword(e.target.value)}
          error={Boolean(error)} helperText={error} sx={{ mb: 2 }}
        />
        <TextField
          label="Type DELETE to confirm" fullWidth size="small" autoComplete="off"
          onKeyDown={onEnter}
          value={word} onChange={(e) => setWord(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={!canDelete} variant="contained" color="error">
          {busy ? 'Deleting…' : 'Delete forever'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
