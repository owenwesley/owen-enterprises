import React, { useCallback, useEffect, useState } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import { getFetch, postFetch } from '../utils/api';

const sxStyles = {
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
    maxWidth: 620,
    my: 'auto',
    borderRadius: 4,
    padding: { xs: '20px 16px', sm: '28px' },
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 1.5,
  },
  header: { fontWeight: 800, color: '#1a237e', fontSize: '1.4rem' },
  meta: { color: '#555', fontSize: '0.9rem' },
  linkRow: { display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' },
  doctorCard: { border: '1px solid #e0e0e0', borderRadius: 2, padding: '14px', display: 'flex', flexDirection: 'column', gap: 0.5 },
  doctorHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 },
  switchesRow: { display: 'flex', flexWrap: 'wrap', columnGap: 2 },
};

const SHARE_LABELS = [
  ['shareBP', 'Blood pressure'],
  ['shareWeight', 'Weight'],
  ['shareReadings', 'Blood glucose readings'],
  ['shareMedications', 'Medications'],
];

export default function MyDoctorsPage() {
  const [doctors, setDoctors] = useState(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linking, setLinking] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const data = await getFetch('/patient-doctors');
    if (!data) { setError('Server unreachable'); return; }
    if (data.error) { setError(data.error); return; }
    setError('');
    setDoctors(data.results);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onLink = async () => {
    const trimmed = code.trim();
    if (!trimmed) { setLinkError('Enter a code'); return; }
    setLinking(true);
    setLinkError('');
    const data = await postFetch('/patient-doctors/link', { inviteCode: trimmed });
    setLinking(false);
    if (!data || data.error) { setLinkError((data && data.error) || 'Server unreachable'); return; }
    setCode('');
    load();
  };

  const onToggle = async (linkId, field, value) => {
    setBusyId(linkId);
    await postFetch(`/patient-doctors/${linkId}/sharing`, { [field]: value ? 1 : 0 });
    setBusyId(null);
    load();
  };

  const onRevoke = async (linkId) => {
    setBusyId(linkId);
    await postFetch(`/patient-doctors/${linkId}/revoke`, {});
    setBusyId(null);
    load();
  };

  const onRelink = async (doctorId) => {
    // A revoked row doesn't carry its doctor's invite code in this view, so
    // relinking after a revoke goes back through the same code entry above —
    // simplest is just telling the patient to ask their doctor for it again
    // isn't necessary here since we already have doctor_id; but the /link
    // route only accepts a code, by design (see routes/patientDoctors.js), so
    // there is deliberately no one-click "undo" — re-entering the code is the
    // same explicit consent step as the first link.
    setLinkError('Ask your doctor for their invite code again to reconnect.');
  };

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Typography sx={sxStyles.header}>My doctors</Typography>
        <Typography sx={sxStyles.meta}>
          Link to a doctor with the invite code they give you, and choose exactly what they can see.
        </Typography>

        <Box sx={sxStyles.linkRow}>
          <TextField
            size="small" label="Doctor's invite code" value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={Boolean(linkError)} helperText={linkError}
            sx={{ flex: '1 1 200px' }}
          />
          <Button variant="contained" disabled={linking} onClick={onLink}>
            {linking ? 'Linking…' : 'Link'}
          </Button>
        </Box>

        <Divider />

        {error && <Typography sx={{ color: '#b71c1c' }}>{error}</Typography>}
        {!doctors && !error && <Typography sx={sxStyles.meta}>Loading…</Typography>}
        {doctors && doctors.length === 0 && (
          <Typography sx={sxStyles.meta}>You haven't linked to any doctors yet.</Typography>
        )}

        {doctors && doctors.map((d) => (
          <Box key={d.id} sx={sxStyles.doctorCard}>
            <Box sx={sxStyles.doctorHead}>
              <Typography sx={{ fontWeight: 700 }}>
                Dr. {d.firstName} {d.lastName}{d.specialty ? ` · ${d.specialty}` : ''}
              </Typography>
              <Chip
                size="small"
                color={d.status === 'active' ? 'success' : 'default'}
                label={d.status === 'active' ? 'Active' : 'Revoked'}
              />
            </Box>

            {d.status === 'active' ? (
              <>
                <Box sx={sxStyles.switchesRow}>
                  {SHARE_LABELS.map(([field, label]) => (
                    <FormControlLabel
                      key={field}
                      control={
                        <Switch
                          size="small"
                          checked={Boolean(d[field])}
                          disabled={busyId === d.id}
                          onChange={(e) => onToggle(d.id, field, e.target.checked)}
                        />
                      }
                      label={label}
                    />
                  ))}
                </Box>
                <Box>
                  <Button size="small" color="error" disabled={busyId === d.id} onClick={() => onRevoke(d.id)}>
                    Revoke access
                  </Button>
                </Box>
              </>
            ) : (
              <Button size="small" onClick={() => onRelink(d.doctor_id)}>
                Reconnect with a new code
              </Button>
            )}
          </Box>
        ))}
      </Paper>
    </div>
  );
}
