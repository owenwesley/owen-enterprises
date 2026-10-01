import React, { useEffect, useState, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { getFetch } from '../utils/api';

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
    padding: { xs: '24px 18px', sm: '32px' },
    display: 'flex',
    flexDirection: 'column',
    gap: 1.5,
    boxSizing: 'border-box',
  },
  header: { fontWeight: 800, color: '#1a237e', fontSize: '1.4rem' },
  meta:   { color: '#555', fontSize: '0.9rem' },
  codeBox: {
    display: 'flex', alignItems: 'center', gap: 1,
    border: '1px dashed #9fa8da', borderRadius: 2, padding: '10px 14px',
    background: '#f5f6fb',
  },
  code: { fontFamily: 'monospace', fontSize: '1.3rem', letterSpacing: '2px', fontWeight: 700, color: '#1a237e' },
  section: { fontWeight: 700, color: '#1a237e', fontSize: '1rem', mt: 1 },
};

const STATUS = {
  pending:  { label: 'Pending approval', color: 'warning',
    text: 'Your account is waiting for review. Once it is approved you will be able to connect with patients.' },
  approved: { label: 'Approved', color: 'success', text: '' },
  rejected: { label: 'Not approved', color: 'error',
    text: 'Your account was not approved. If you think this is a mistake, contact the site administrator.' },
};

export default function DoctorHomePage() {
  const { state } = useAppContext();
  const { user } = state;
  const history = useHistory();
  const [me, setMe] = useState(null);
  const [patients, setPatients] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Status comes from the server, not the session: the copy saved at sign-in
  // goes stale when an admin approves the account while the doctor is logged in.
  const load = useCallback(async () => {
    const data = await getFetch('/doctor/me');
    if (!data) { setError('Server unreachable'); return; }
    if (data.error) { setError(data.error); return; }
    setError('');
    setMe(data.results);
    if (data.results.doctorStatus === 'approved') {
      const list = await getFetch('/doctor/patients');
      if (list && !list.error) setPatients(list.results);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copyCode = () => {
    if (!me || !me.inviteCode) return;
    navigator.clipboard?.writeText(me.inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const info = me && STATUS[me.doctorStatus];

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Typography sx={sxStyles.header}>Doctor portal</Typography>
        <Typography sx={sxStyles.meta}>
          Dr. {user.firstName} {user.lastName}
        </Typography>

        {error && <Typography sx={{ color: '#b71c1c' }}>{error}</Typography>}
        {!me && !error && <Typography sx={sxStyles.meta}>Loading…</Typography>}

        {info && (
          <>
            <Box><Chip size="small" color={info.color} label={info.label} /></Box>
            {info.text && <Typography>{info.text}</Typography>}
            <Typography sx={sxStyles.meta}>
              License {me.licenseNumber}{me.specialty ? ` · ${me.specialty}` : ''}
            </Typography>
            <Typography sx={sxStyles.meta}>
              {me.clinicName ? `Currently at ${me.clinicName}` : 'No clinic on file'}
              {' — '}
              <Link to="/doctor/clinic" style={{ color: '#1a237e', fontWeight: 600 }}>
                Browse clinics / request a change
              </Link>
            </Typography>
          </>
        )}

        {me && me.doctorStatus === 'approved' && (
          <>
            <Typography sx={sxStyles.section}>Your invite code</Typography>
            <Typography sx={sxStyles.meta}>
              Share this with a patient — they enter it on their own "My Doctors" page to link their account to yours.
            </Typography>
            <Box sx={sxStyles.codeBox}>
              <Typography sx={sxStyles.code}>{me.inviteCode}</Typography>
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={copyCode}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </Box>

            <Typography sx={sxStyles.section}>Your patients</Typography>
            {patients === null && <Typography sx={sxStyles.meta}>Loading…</Typography>}
            {patients && patients.length === 0 && (
              <Typography sx={sxStyles.meta}>No patients have linked to you yet.</Typography>
            )}
            {patients && patients.length > 0 && (
              <List disablePadding>
                {patients.map((p) => (
                  <ListItemButton
                    key={p.patient_id}
                    onClick={() => history.push(`/doctor/patients/${p.patient_id}`)}
                    sx={{ border: '1px solid #e0e0e0', borderRadius: 1, mb: 1 }}
                  >
                    <ListItemText
                      primary={`${p.firstName} ${p.lastName}`}
                      secondary={[
                        p.shareBP && 'BP', p.shareWeight && 'Weight',
                        p.shareReadings && 'Readings', p.shareMedications && 'Medications',
                      ].filter(Boolean).join(', ') || 'Nothing shared yet'}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </>
        )}
      </Paper>
    </div>
  );
}
