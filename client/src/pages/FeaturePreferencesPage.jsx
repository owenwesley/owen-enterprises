import React, { useState, useEffect } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Divider from '@mui/material/Divider';
import { useHistory } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useFeaturePreferences } from '../hooks/useFeaturePreferences';

const sxStyles = {
  wrapper: {
    height: '100%',
    overflowY: 'auto',
    display: 'flex',
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
    padding: 12,
  },
  // NOTE: values inside `sx` are in theme units (1 = 8 px for spacing, 4 px for
  // borderRadius), so sizes written as plain numbers there came out huge (a
  // 28 gave 224 px). Use px strings in sx. margin:auto centres the card without
  // clipping its top when it is taller than the screen.
  card: {
    width: '100%',
    maxWidth: 480,
    margin: 'auto',
    borderRadius: '16px',
    padding: { xs: '16px 14px', sm: '24px 28px' },
  },
  header: {
    fontWeight: 800,
    color: '#1a237e',
    fontSize: '1.4rem',
    marginBottom: '2px',
  },
  sub: {
    color: '#666',
    marginBottom: '8px',
    fontSize: '0.9rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
  },
  featureInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  icon:  { fontSize: '1.6rem' },
  label: { fontWeight: 700, fontSize: '1rem' },
  desc:  { color: '#666', fontSize: '0.8rem', marginTop: '1px', lineHeight: 1.3 },
  saveBtn: {
    marginTop: '14px',
    background: '#1a237e',
    color: '#fff',
    width: '100%',
    borderRadius: '8px',
    '&:hover': { background: '#283593' },
  },
  savedBadge: {
    background: '#e8f5e9',
    color: '#2e7d32',
    borderRadius: '8px',
    padding: '4px 12px',
    fontSize: '0.85rem',
    fontWeight: 600,
    display: 'inline-block',
    marginTop: 8,
  },
  warning: {
    color: '#e65100',
    fontSize: '0.8rem',
    marginTop: '4px',
    fontStyle: 'italic',
  },
};

const FEATURES = [
  {
    key:     'chkBgtracker',
    icon:    '🩸',
    label:   'BG Tracker',
    desc:    'Blood glucose readings, blood pressure, medications, weight & charts',
  },
  {
    key:     'chkCommunityLibrary',
    icon:    '📚',
    label:   'Community Library',
    desc:    'Manage the book and movie collection — track who has what',
  },
  {
    key:     'chkMeetings',
    icon:    '🤝',
    label:   'Meetings',
    desc:    'NA / AA meeting records, chips, medallions and running balance',
  },
  {
    key:     'chkChurch',
    icon:    '⛪',
    label:   'Church',
    desc:    'Join your church, see its members and mission statement',
  },
];

export default function FeaturePreferencesPage() {
  const { state } = useAppContext();
  const { featurePreferences } = state;
  const { saveFeaturePreferences } = useFeaturePreferences();
  const history = useHistory();
  // A brand-new account that has never saved this page (see FirstSignInRedirect in NavBar).
  // Captured once so the welcome wording stays while they work, even after a save.
  const [firstTime] = useState(() => featurePreferences.loaded && Number(featurePreferences.featuresChosen) === 0);

  const pick = (p) => ({
    chkBgtracker: p.chkBgtracker === 1 ? 1 : 0,
    chkCommunityLibrary: p.chkCommunityLibrary === 1 ? 1 : 0,
    chkMeetings: p.chkMeetings === 1 ? 1 : 0,
    chkChurch: p.chkChurch === 1 ? 1 : 0,
  });

  // Local copy so the user can toggle without immediately saving. Only the four switches.
  const [local, setLocal] = useState(pick(featurePreferences));
  const [saved,  setSaved]  = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync if featurePreferences loads after mount
  useEffect(() => {
    setLocal(pick(featurePreferences));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featurePreferences]);

  const toggle = (key) => {
    // Everything may be off: a member who wants none of it is allowed to.
    setLocal((prev) => ({ ...prev, [key]: prev[key] ? 0 : 1 }));
    setSaved(false);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await saveFeaturePreferences(local);
      setSaved(true);
      if (firstTime) history.push('/');
    } finally {
      setSaving(false);
    }
  };

  // "Skip for now": saves everything as it stands (all off) so the prompt does not come back.
  const onSkip = async () => {
    setSaving(true);
    try {
      await saveFeaturePreferences(pick({}));
      history.push('/');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Typography sx={sxStyles.header}>{firstTime ? 'Welcome! What would you like to use?' : 'Feature Access'}</Typography>
        <Typography sx={sxStyles.sub}>
          {firstTime
            ? 'Everything is off to start. Turn on what you want; you can change this any time under Feature access.'
            : 'Choose which features appear on your landing page.'}
        </Typography>

        {FEATURES.map((f, i) => (
          <React.Fragment key={f.key}>
            {i > 0 && <Divider />}
            <div style={sxStyles.row}>
              <div style={sxStyles.featureInfo}>
                <span style={sxStyles.icon}>{f.icon}</span>
                <div>
                  <Typography sx={sxStyles.label}>{f.label}</Typography>
                  <Typography sx={sxStyles.desc}>{f.desc}</Typography>
                </div>
              </div>
              <Switch
                checked={local[f.key] === 1}
                onChange={() => toggle(f.key)}
                color="primary"
              />
            </div>
          </React.Fragment>
        ))}

        {local.chkBgtracker === 1 && (
          <Typography sx={sxStyles.warning}>
            BG Tracker holds health information. Turning it on means you will be asked to set up
            two-step sign-in and accept the privacy consent forms before it opens.
          </Typography>
        )}

        <Button
          sx={sxStyles.saveBtn}
          variant="contained"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : firstTime ? 'Save and continue' : 'Save Preferences'}
        </Button>
        {firstTime && (
          <Button sx={{ mt: 1, width: '100%' }} variant="text" onClick={onSkip} disabled={saving}>
            Skip for now
          </Button>
        )}

        {saved && (
          <div style={{ textAlign: 'center' }}>
            <span style={sxStyles.savedBadge}>✓ Saved</span>
          </div>
        )}
      </Paper>

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message="Feature preferences saved"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  );
}
