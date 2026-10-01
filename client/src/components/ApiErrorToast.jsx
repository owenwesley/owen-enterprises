import React, { useEffect, useState } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

// Shows the message from any failed API call (see report() in utils/api.js),
// so a save that the server rejected is no longer silent.
export default function ApiErrorToast() {
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const onErr = (e) => setMsg(e.detail?.message || 'Something went wrong.');
    window.addEventListener('oe:api-error', onErr);
    return () => window.removeEventListener('oe:api-error', onErr);
  }, []);

  return (
    <Snackbar
      open={Boolean(msg)}
      autoHideDuration={6000}
      onClose={(_, reason) => { if (reason !== 'clickaway') setMsg(null); }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity="error" variant="filled" onClose={() => setMsg(null)} sx={{ width: '100%' }}>
        {msg}
      </Alert>
    </Snackbar>
  );
}
