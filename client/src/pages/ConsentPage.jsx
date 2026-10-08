import React, { useCallback, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import { useAppContext } from '../context/AppContext';
import { getFetch, postFetch } from '../utils/api';
import { usePreferences } from '../features/bgtracker/hooks/usePreferences';
import { useReadings } from '../features/bgtracker/hooks/useReadings';

// Shown when BGTracker health data needs two-step sign-in and/or the consent
// forms (server: middleware/hipaaGate.js; wording: config/hipaaForms.js).
const sxStyles = {
  wrapper: {
    flex: '1 1 auto', minHeight: 0, overflowY: 'auto', width: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: { xs: '16px 12px', sm: '24px' }, boxSizing: 'border-box',
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
  },
  card: {
    width: '100%', maxWidth: 560, my: 'auto', borderRadius: 4,
    padding: { xs: '24px 18px', sm: '32px 32px' },
    display: 'flex', flexDirection: 'column', gap: 1.75, boxSizing: 'border-box',
  },
  header: { fontWeight: 800, color: '#1a237e', fontSize: '1.4rem' },
  title:  { fontWeight: 700, color: '#1a237e', fontSize: '1rem' },
  text:   { color: '#444', fontSize: '0.9rem' },
  formBox: { whiteSpace: 'pre-line', fontSize: '0.88rem', color: '#333', background: '#f3f4fa',
             borderRadius: '8px', padding: '12px 14px', maxHeight: '32vh', overflowY: 'auto' },
  accept: { display: 'flex', alignItems: 'center', fontSize: '0.9rem' },
  btn:    { background: '#1a237e', color: '#fff', borderRadius: 2, '&:hover': { background: '#283593' } },
  err:    { color: '#b71c1c', fontSize: '0.85rem' },
};

export default function ConsentPage() {
  const history = useHistory();
  const { state } = useAppContext();
  const userId = state.user.id;
  const { loadUserPreference } = usePreferences();
  const { getReadings } = useReadings();

  const [status, setStatus] = useState(null); // { bgtrackerEnabled, mfaEnabled, missing }
  const [forms, setForms] = useState([]);
  const [ticked, setTicked] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const st = await getFetch(`/hipaa/status/${userId}`);
    if (!st || !st.results) return;
    setStatus(st.results);
    if (st.results.bgtrackerEnabled && st.results.mfaEnabled && st.results.missing.length > 0) {
      const f = await getFetch(`/hipaa/forms/${userId}`);
      setForms((f && f.results) || []);
    } else {
      setForms([]);
    }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const allTicked = forms.length > 0 && forms.every((f) => ticked[f.key]);

  const accept = async () => {
    setBusy(true); setError('');
    for (const f of forms) {
      const res = await postFetch(`/hipaa/accept/${userId}`, { formKey: f.key, formVersion: f.version });
      if (!res || res.error) {
        setBusy(false);
        setError((res && res.error) || 'Could not record your answer. Please try again.');
        return;
      }
    }
    setBusy(false);
    // The readings and preferences were refused before; load them now.
    loadUserPreference(userId);
    getReadings(userId);
    history.push('/');
  };

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Typography sx={sxStyles.header}>Health information</Typography>

        {!status && <Typography sx={sxStyles.text}>Loading…</Typography>}

        {status && !status.bgtrackerEnabled && (
          <>
            <Typography sx={sxStyles.text}>
              BGTracker is turned off for your account, so nothing is needed here.
              Turn it on in Feature access if you want to use it.
            </Typography>
            <Button sx={sxStyles.btn} variant="contained" onClick={() => history.push('/feature-preferences')}>
              Feature access
            </Button>
          </>
        )}

        {status && status.bgtrackerEnabled && !status.mfaEnabled && (
          <>
            <Typography sx={sxStyles.text}>
              Before you can use health information in BGTracker you need two-step sign-in
              (a code texted to your phone when you sign in). It takes a couple of minutes.
            </Typography>
            <Button sx={sxStyles.btn} variant="contained" onClick={() => history.push('/security')}>
              Set up two-step sign-in
            </Button>
            <Typography sx={sxStyles.text}>
              When that is done, come back here and accept the notices. You can also{' '}
              <span style={{ color: '#1a237e', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => history.push('/feature-preferences')}>turn BGTracker off</span>{' '}
              instead.
            </Typography>
          </>
        )}

        {status && status.bgtrackerEnabled && status.mfaEnabled && forms.length > 0 && (
          <>
            <Typography sx={sxStyles.text}>
              Please read and accept the following to use BGTracker.
            </Typography>
            {forms.map((f) => (
              <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Typography sx={sxStyles.title}>{f.title}</Typography>
                <div style={sxStyles.formBox}>{f.text}</div>
                <div style={sxStyles.accept}>
                  <Checkbox id={`consent-${f.key}`} checked={Boolean(ticked[f.key])}
                    onChange={(e) => setTicked((t) => ({ ...t, [f.key]: e.target.checked }))} />
                  <label htmlFor={`consent-${f.key}`}>I have read this and I accept</label>
                </div>
              </div>
            ))}
            {error && <Typography sx={sxStyles.err}>{error}</Typography>}
            <Button sx={sxStyles.btn} variant="contained" disabled={!allTicked || busy} onClick={accept}>
              Accept and continue
            </Button>
          </>
        )}

        {status && status.bgtrackerEnabled && status.mfaEnabled && forms.length === 0 && (
          <>
            <Typography sx={sxStyles.text}>Everything is in place. You can use BGTracker.</Typography>
            <Button sx={sxStyles.btn} variant="contained" onClick={() => history.push('/')}>Continue</Button>
          </>
        )}
      </Paper>
    </div>
  );
}
