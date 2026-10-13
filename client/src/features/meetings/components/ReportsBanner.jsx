import React, { useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { downloadReport, deleteReport } from '../utils/sendReport';

// Shown on the Meetings page while saved reports are waiting on the server. Downloading or printing does NOT
// remove a report: it stays until the user confirms with "I saved it", so a failed download loses nothing.
export default function ReportsBanner({ userId, reports }) {
  const [busy, setBusy] = useState('');
  if (!reports.length) return null;
  const go = async (name, print) => { setBusy(name); await downloadReport({ userId, name, print }); setBusy(''); };
  const saved = async (name) => {
    if (!window.confirm(`Have you saved or printed "${name}"?\n\nIt will be removed from the server and cannot be downloaded again.`)) return;
    setBusy(name); await deleteReport({ userId, name }); setBusy('');
  };
  return (
    <Alert severity="info" sx={{ mb: 1.5 }} role="status">
      <AlertTitle>
        You have {reports.length} {reports.length === 1 ? 'report' : 'reports'} to print or save
      </AlertTitle>
      <Typography variant="body2" sx={{ mb: 1 }}>
        1. Tap Download (save to this computer) or Print. 2. Check that you have it. 3. Tap "I saved it" to remove it
        from the server. Until you do, the report stays here and this reminder stays on.
      </Typography>
      {reports.map((r) => (
        <Box key={r.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mr: 'auto', wordBreak: 'break-word' }}>{r.name}</Typography>
          <Button size="small" variant="contained" disabled={busy === r.name} onClick={() => go(r.name, false)}>Download</Button>
          <Button size="small" variant="outlined" disabled={busy === r.name} onClick={() => go(r.name, true)}>Print</Button>
          <Button size="small" variant="outlined" color="success" disabled={busy === r.name} onClick={() => saved(r.name)}>I saved it</Button>
        </Box>
      ))}
    </Alert>
  );
}
