import React, { useCallback, useEffect, useRef, useState } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { getFetch, putFetch, deleteFetch, postFormData, notifyError } from '../utils/api';
import AuthImage from '../components/AuthImage';

const sx = {
  wrapper: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: { xs: '16px 12px', sm: '24px' }, boxSizing: 'border-box', background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)' },
  card: { width: '100%', maxWidth: 700, my: 'auto', borderRadius: 4, padding: { xs: '20px 16px', sm: '28px' }, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 1.5 },
  header: { fontWeight: 800, color: '#1a237e', fontSize: '1.4rem' },
  meta: { color: '#555', fontSize: '0.9rem' },
  photo: { border: '1px solid #e0e0e0', borderRadius: 2, padding: '12px', display: 'flex', gap: 1.5, flexWrap: 'wrap' },
};
const thumbStyle = { width: 120, height: 120, borderRadius: 8 };

/** Photos a patient keeps (a leg, an arm, a sore, a rash). Private until shared with a doctor. */
export default function PatientPhotosPage() {
  const [photos, setPhotos] = useState(null);
  const [error, setError] = useState('');
  const [bodyArea, setBodyArea] = useState('');
  const [note, setNote] = useState('');
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);       // photo shown large
  const [confirmDel, setConfirmDel] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const data = await getFetch('/patient-photos');
    if (!data) { setError('Server unreachable'); return; }
    if (data.error) { setError(data.error); return; }
    setError(''); setPhotos(data.results);
  }, []);
  useEffect(() => { load(); }, [load]);

  const onPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';                           // lets the same picture be chosen again
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.append('image', file);
    form.append('bodyArea', bodyArea);
    form.append('note', note);
    form.append('shared', share ? '1' : '0');
    const data = await postFormData('/patient-photos', form);
    setBusy(false);
    if (!data || data.error) { if (data && data.error) notifyError(data.error); return; }
    setBodyArea(''); setNote('');
    load();
  };

  const toggleShared = async (p) => { await putFetch(`/patient-photos/${p.id}`, { shared: p.shared ? 0 : 1 }); load(); };
  const doDelete = async () => {
    const p = confirmDel; setConfirmDel(null);
    await deleteFetch(`/patient-photos/${p.id}`); setView(null); load();
  };

  return (
    <div style={sx.wrapper}>
      <Paper sx={sx.card} elevation={6}>
        <Typography sx={sx.header}>My photos</Typography>
        <Typography sx={sx.meta}>
          Take a picture of a leg, arm, sore or rash. Every photo is private until you choose to share it,
          and a doctor sees it only if you have also turned on Photos for that doctor on the My doctors page.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <TextField size="small" label="Where on the body (optional)" value={bodyArea}
            onChange={(e) => setBodyArea(e.target.value)} inputProps={{ maxLength: 60 }} sx={{ flex: '1 1 200px' }} />
          <TextField size="small" label="Note (optional)" value={note}
            onChange={(e) => setNote(e.target.value)} inputProps={{ maxLength: 500 }} sx={{ flex: '2 1 260px' }} />
        </Box>
        <FormControlLabel control={<Switch size="small" checked={share} onChange={(e) => setShare(e.target.checked)} />}
          label="Share this photo with my doctors" />
        <Box>
          {/* capture="environment" opens the phone camera straight away; on a computer it is a file picker */}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPick}
            style={{ display: 'none' }} aria-label="Take or choose a photo" />
          <Button variant="contained" startIcon={<PhotoCameraIcon />} disabled={busy}
            onClick={() => fileRef.current && fileRef.current.click()}>
            {busy ? 'Saving…' : 'Take or choose a photo'}
          </Button>
        </Box>

        <Divider />
        {error && <Typography sx={{ color: '#b71c1c' }}>{error}</Typography>}
        {!photos && !error && <Typography sx={sx.meta}>Loading…</Typography>}
        {photos && photos.length === 0 && <Typography sx={sx.meta}>No photos yet.</Typography>}

        {photos && photos.map((p) => (
          <Box key={p.id} sx={sx.photo}>
            <AuthImage src={`/patient-photos/${p.id}/file?size=thumb`} alt={p.bodyArea || 'Photo'} style={thumbStyle} onClick={() => setView(p)} />
            <Box sx={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography sx={{ fontWeight: 700 }}>{p.bodyArea || 'Photo'} · {p.takenOn}</Typography>
              {p.note && <Typography sx={sx.meta}>{p.note}</Typography>}
              <Box><Chip size="small" color={p.shared ? 'success' : 'default'} label={p.shared ? 'Shared with doctors' : 'Private'} /></Box>
              {p.notes.map((n) => (
                <Typography key={n.id} sx={{ fontSize: '0.85rem', background: '#e8eaf6', borderRadius: 1, padding: '6px 8px' }}>
                  <b>{n.doctorName}:</b> {n.body}
                </Typography>
              ))}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" onClick={() => toggleShared(p)}>{p.shared ? 'Stop sharing' : 'Share'}</Button>
                <Button size="small" color="error" onClick={() => setConfirmDel(p)}>Delete</Button>
              </Box>
            </Box>
          </Box>
        ))}
      </Paper>

      <Dialog open={Boolean(view)} onClose={() => setView(null)} maxWidth="md" fullWidth>
        <DialogTitle>{view && `${view.bodyArea || 'Photo'} · ${view.takenOn}`}</DialogTitle>
        <DialogContent>
          {view && <AuthImage src={`/patient-photos/${view.id}/file`} alt={view.bodyArea || 'Photo'} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }} />}
        </DialogContent>
        <DialogActions><Button onClick={() => setView(null)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmDel)} onClose={() => setConfirmDel(null)}>
        <DialogTitle>Delete this photo?</DialogTitle>
        <DialogContent><Typography>The picture and any doctor notes on it are removed for good.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDel(null)}>Cancel</Button>
          <Button color="error" onClick={doDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
