import React, { useCallback, useEffect, useState } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { getFetch, postFetch, deleteFetch } from '../utils/api';

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
  meta:   { color: '#555', fontSize: '0.9rem' },
  clinicRow: {
    border: '1px solid #e0e0e0', borderRadius: 2, padding: '10px 14px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
  },
};

export default function DoctorClinicPage() {
  const [query, setQuery] = useState('');
  const [clinics, setClinics] = useState(null);
  const [myRequest, setMyRequest] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const loadClinics = useCallback(async (q) => {
    const data = await getFetch(`/doctor/clinics${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    if (data?.error) { setError(data.error); return; }
    setClinics(data?.results || []);
  }, []);

  const loadMyRequest = useCallback(async () => {
    const data = await getFetch('/doctor/clinic-request');
    if (data?.error) { setError(data.error); return; }
    setMyRequest(data?.results || null);
  }, []);

  useEffect(() => { loadClinics(''); loadMyRequest(); }, [loadClinics, loadMyRequest]);

  useEffect(() => {
    const t = setTimeout(() => loadClinics(query), 300);
    return () => clearTimeout(t);
  }, [query, loadClinics]);

  const requestClinic = async (clinicId) => {
    setBusyId(clinicId);
    setError('');
    const res = await postFetch('/doctor/clinic-request', { clinic_id: clinicId });
    if (res?.error) setError(res.error);
    else await loadMyRequest();
    setBusyId(null);
  };

  const withdraw = async () => {
    setBusyId('withdraw');
    setError('');
    const res = await deleteFetch('/doctor/clinic-request');
    if (res?.error) setError(res.error);
    else await loadMyRequest();
    setBusyId(null);
  };

  const pending = myRequest?.clinicRequestStatus === 'pending';

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Typography sx={sxStyles.header}>Clinics</Typography>

        {error && <Typography sx={{ color: '#b71c1c' }}>{error}</Typography>}

        <Typography sx={sxStyles.meta}>
          {myRequest?.clinicName ? `Currently assigned to ${myRequest.clinicName}` : 'No clinic on file'}
        </Typography>

        {pending && (
          <Box sx={{ ...sxStyles.clinicRow, background: '#fff8e1', borderColor: '#ffe082' }}>
            <Box>
              <Chip size="small" color="warning" label="Pending" sx={{ mr: 1 }} />
              Requested move to {myRequest.requestedClinicName || `clinic #${myRequest.requestedClinicId}`}
            </Box>
            <Button size="small" color="error" disabled={busyId === 'withdraw'} onClick={withdraw}>
              Withdraw
            </Button>
          </Box>
        )}

        <Divider />

        <TextField
          label="Search clinics"
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
        />

        {clinics === null && <Typography sx={sxStyles.meta}>Loading…</Typography>}
        {clinics && clinics.length === 0 && (
          <Typography sx={sxStyles.meta}>No clinics match your search.</Typography>
        )}

        {clinics && clinics.length > 0 && (
          <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {clinics.map((c) => (
              <ListItem key={c.id} disablePadding sx={sxStyles.clinicRow}>
                <ListItemText primary={c.name} secondary={c.address} />
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busyId === c.id || pending}
                  onClick={() => requestClinic(c.id)}
                >
                  Request move
                </Button>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </div>
  );
}
