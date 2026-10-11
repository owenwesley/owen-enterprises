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
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
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
  section: { fontWeight: 700, color: '#1a237e', fontSize: '1rem', mt: 0.5 },
  clinicRow: {
    border: '1px solid #e0e0e0', borderRadius: 2, padding: '10px 14px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
  },
};

const TYPE_LABEL = { clinic: 'Clinic', hospital: 'Hospital' };

export default function DoctorClinicPage() {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [places, setPlaces] = useState(null);       // everything that matches the search
  const [mine, setMine] = useState(null);           // { clinics: [...], requests: [...] }
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const loadPlaces = useCallback(async (q, type) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (type !== 'all') params.set('type', type);
    const qs = params.toString();
    const data = await getFetch(`/doctor/clinics${qs ? `?${qs}` : ''}`);
    if (data?.error) { setError(data.error); return; }
    setPlaces(data?.results || []);
  }, []);

  const loadMine = useCallback(async () => {
    const data = await getFetch('/doctor/my-clinics');
    if (data?.error) { setError(data.error); return; }
    setMine(data?.results || { clinics: [], requests: [] });
  }, []);

  useEffect(() => { loadMine(); }, [loadMine]);

  useEffect(() => {
    const t = setTimeout(() => loadPlaces(query, typeFilter), 300);
    return () => clearTimeout(t);
  }, [query, typeFilter, loadPlaces]);

  const sendRequest = async (clinicId, action) => {
    setBusyId(clinicId);
    setError('');
    const res = await postFetch('/doctor/clinic-requests', { clinic_id: clinicId, action });
    if (res?.error) setError(res.error);
    else await loadMine();
    setBusyId(null);
  };

  const withdraw = async (clinicId) => {
    setBusyId(clinicId);
    setError('');
    const res = await deleteFetch(`/doctor/clinic-requests/${clinicId}`);
    if (res?.error) setError(res.error);
    else await loadMine();
    setBusyId(null);
  };

  const myPlaces = mine?.clinics || [];
  const requests = mine?.requests || [];
  const requestFor = (id) => requests.find((r) => r.id === id);
  const isMine = (id) => myPlaces.some((c) => c.id === id);

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Typography sx={sxStyles.header}>Clinics and hospitals</Typography>

        {error && <Typography sx={{ color: '#b71c1c' }}>{error}</Typography>}

        <Typography sx={sxStyles.section}>Where you work</Typography>
        {mine === null && <Typography sx={sxStyles.meta}>Loading…</Typography>}
        {mine && myPlaces.length === 0 && (
          <Typography sx={sxStyles.meta}>
            Nothing on file yet. Find your clinic or hospital below and request to add it.
          </Typography>
        )}
        {myPlaces.map((c) => {
          const pendingRemoval = requestFor(c.id)?.action === 'remove';
          return (
            <Box key={c.id} sx={sxStyles.clinicRow}>
              <Box>
                <Typography sx={{ fontWeight: 600 }}>{c.name}</Typography>
                <Typography sx={sxStyles.meta}>
                  {TYPE_LABEL[c.type] || 'Clinic'}{c.address ? ` · ${c.address}` : ''}
                </Typography>
                {c.isPrimary && <Chip size="small" color="primary" label="Primary" sx={{ mt: 0.5 }} />}
                {pendingRemoval && <Chip size="small" color="warning" label="Removal pending" sx={{ mt: 0.5, ml: c.isPrimary ? 1 : 0 }} />}
              </Box>
              {pendingRemoval ? (
                <Button size="small" disabled={busyId === c.id} onClick={() => withdraw(c.id)}>
                  Withdraw
                </Button>
              ) : (
                <Button size="small" color="error" disabled={busyId === c.id}
                  onClick={() => sendRequest(c.id, 'remove')}>
                  Request removal
                </Button>
              )}
            </Box>
          );
        })}

        {requests.some((r) => r.action === 'add') && (
          <>
            <Typography sx={sxStyles.section}>Waiting for approval</Typography>
            {requests.filter((r) => r.action === 'add').map((r) => (
              <Box key={r.id} sx={{ ...sxStyles.clinicRow, background: '#fff8e1', borderColor: '#ffe082' }}>
                <Box>
                  <Chip size="small" color="warning" label="Pending" sx={{ mr: 1 }} />
                  Add {r.name} ({TYPE_LABEL[r.type] || 'Clinic'})
                </Box>
                <Button size="small" color="error" disabled={busyId === r.id} onClick={() => withdraw(r.id)}>
                  Withdraw
                </Button>
              </Box>
            ))}
          </>
        )}

        <Divider />

        <Typography sx={sxStyles.section}>Find a clinic or hospital</Typography>
        <ToggleButtonGroup
          size="small" exclusive value={typeFilter}
          onChange={(_, v) => { if (v) setTypeFilter(v); }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="clinic">Clinics</ToggleButton>
          <ToggleButton value="hospital">Hospitals</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          label="Search by name"
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
        />

        {places === null && <Typography sx={sxStyles.meta}>Loading…</Typography>}
        {places && places.length === 0 && (
          <Typography sx={sxStyles.meta}>Nothing matches your search.</Typography>
        )}

        {places && places.length > 0 && (
          <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {places.map((c) => {
              const mineAlready = isMine(c.id);
              const pending = requestFor(c.id);
              return (
                <ListItem key={c.id} disablePadding sx={sxStyles.clinicRow}>
                  <ListItemText
                    primary={c.name}
                    secondary={`${TYPE_LABEL[c.type] || 'Clinic'}${c.address ? ` · ${c.address}` : ''}`}
                  />
                  {mineAlready ? (
                    <Chip size="small" label="You work here" />
                  ) : pending ? (
                    <Chip size="small" color="warning" label="Pending" />
                  ) : (
                    <Button size="small" variant="outlined" disabled={busyId === c.id}
                      onClick={() => sendRequest(c.id, 'add')}>
                      Request to add
                    </Button>
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </Paper>
    </div>
  );
}
