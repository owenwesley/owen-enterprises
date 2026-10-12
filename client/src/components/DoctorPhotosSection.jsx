import React, { useCallback, useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { getFetch, postFetch, deleteFetch } from '../utils/api';
import AuthImage from './AuthImage';

/** Photos a patient has shared with this doctor, with the doctor's notes. Only mounted when the patient shares Photos. */
export default function DoctorPhotosSection({ patientId, myId }) {
  const [photos, setPhotos] = useState(null);
  const [view, setView] = useState(null);
  const [draft, setDraft] = useState({});
  const base = `/doctor/patients/${patientId}/photos`;

  const load = useCallback(async () => {
    const data = await getFetch(base);
    setPhotos(data && !data.error ? data.results : []);
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const addNote = async (p) => {
    const body = (draft[p.id] || '').trim();
    if (!body) return;
    const r = await postFetch(`${base}/${p.id}/notes`, { body });
    if (r && !r.error) { setDraft((d) => ({ ...d, [p.id]: '' })); load(); }
  };
  const delNote = async (p, n) => { await deleteFetch(`${base}/${p.id}/notes/${n.id}`); load(); };

  if (!photos) return <Typography sx={{ color: '#555', fontSize: '0.9rem' }}>Loading…</Typography>;
  if (photos.length === 0) return <Typography sx={{ color: '#555', fontSize: '0.9rem' }}>The patient has not shared any photos yet.</Typography>;
  return (
    <>
      {photos.map((p) => (
        <Box key={p.id} sx={{ border: '1px solid #e0e0e0', borderRadius: 2, padding: '12px', display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <AuthImage src={`${base}/${p.id}/file?size=thumb`} alt={p.bodyArea || 'Photo'} style={{ width: 120, height: 120, borderRadius: 8 }} onClick={() => setView(p)} />
          <Box sx={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography sx={{ fontWeight: 700 }}>{p.bodyArea || 'Photo'} · {p.takenOn}</Typography>
            {p.note && <Typography sx={{ color: '#555', fontSize: '0.9rem' }}>Patient: {p.note}</Typography>}
            {p.notes.map((n) => (
              <Typography key={n.id} sx={{ fontSize: '0.85rem', background: '#e8eaf6', borderRadius: 1, padding: '6px 8px' }}>
                <b>{n.doctorName}:</b> {n.body}
                {Number(n.doctor_id) === Number(myId) && (
                  <Button size="small" color="error" sx={{ ml: 1, minWidth: 0 }} onClick={() => delNote(p, n)}>Delete</Button>
                )}
              </Typography>
            ))}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField size="small" fullWidth multiline label="Add a note (the patient can read it)"
                value={draft[p.id] || ''} inputProps={{ maxLength: 1000 }}
                onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))} />
              <Button variant="contained" size="small" onClick={() => addNote(p)}>Add</Button>
            </Box>
          </Box>
        </Box>
      ))}
      <Dialog open={Boolean(view)} onClose={() => setView(null)} maxWidth="md" fullWidth>
        <DialogContent>
          {view && <AuthImage src={`${base}/${view.id}/file`} alt={view.bodyArea || 'Photo'} style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }} />}
        </DialogContent>
        <DialogActions><Button onClick={() => setView(null)}>Close</Button></DialogActions>
      </Dialog>
    </>
  );
}
