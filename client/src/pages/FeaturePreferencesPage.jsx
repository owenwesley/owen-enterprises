import React, { useState, useEffect } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Divider from '@mui/material/Divider';
import { useAppContext } from '../context/AppContext';
import { useFeaturePreferences } from '../hooks/useFeaturePreferences';

const sxStyles = {
  wrapper: {
    height: '100%',
    overflowY: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 16,
    padding: '36px 32px',
  },
  header: {
    fontWeight: 800,
    color: '#1a237e',
    fontSize: '1.4rem',
    marginBottom: 4,
  },
  sub: {
    color: '#666',
    marginBottom: 24,
    fontSize: '0.9rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 0',
  },
  featureInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  icon:  { fontSize: '2rem' },
  label: { fontWeight: 700, fontSize: '1rem' },
  desc:  { color: '#666', fontSize: '0.82rem', marginTop: 2 },
  saveBtn: {
    marginTop: 28,
    background: '#1a237e',
    color: '#fff',
    width: '100%',
    borderRadius: 8,
    '&:hover': { background: '#283593' },
  },
  savedBadge: {
    background: '#e8f5e9',
    color: '#2e7d32',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: '0.85rem',
    fontWeight: 600,
    display: 'inline-block',
    marginTop: 12,
  },
  warning: {
    color: '#e65100',
    fontSize: '0.8rem',
    marginTop: 8,
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
];

export default function FeaturePreferencesPage() {
  const { state } = useAppContext();
  const { featurePreferences } = state;
  const { saveFeaturePreferences } = useFeaturePreferences();

  // Local copy so the user can toggle without immediately saving
  const [local, setLocal] = useState({ ...featurePreferences });
  const [saved,  setSaved]  = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync if featurePreferences loads after mount
  useEffect(() => {
    setLocal({ ...featurePreferences });
  }, [featurePreferences]);

  const toggle = (key) => {
    setLocal((prev) => {
      const next = { ...prev, [key]: prev[key] ? 0 : 1 };
      // Must keep at least one feature enabled
      const anyEnabled = Object.values(next).some((v) => v === 1);
      return anyEnabled ? next : prev;
    });
    setSaved(false);
  };

  const onSave = async () => {
    setSaving(true);
    await saveFeaturePreferences(local);
    setSaving(false);
    setSaved(true);
  };

  const enabledCount = Object.values(local).filter((v) => v === 1).length;

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Typography sx={sxStyles.header}>Feature Access</Typography>
        <Typography sx={sxStyles.sub}>
          Choose which features appear on your landing page.
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

        {enabledCount === 1 && (
          <Typography sx={sxStyles.warning}>
            At least one feature must stay enabled.
          </Typography>
        )}

        <Button
          sx={sxStyles.saveBtn}
          variant="contained"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Preferences'}
        </Button>

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
