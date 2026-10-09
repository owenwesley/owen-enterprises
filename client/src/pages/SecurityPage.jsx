import React, { useCallback, useEffect, useState } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useAppContext } from '../context/AppContext';
import { getFetch, postFetch } from '../utils/api';
import { forgetDeviceToken } from '../hooks/useAuth';

// Two-step sign-in by text message (US and Canada numbers). Server: routes/mfa.js.
const sxStyles = {
  wrapper: {
    flex: '1 1 auto', minHeight: 0, overflowY: 'auto', width: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: { xs: '16px 12px', sm: '24px' }, boxSizing: 'border-box',
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
  },
  card: {
    width: '100%', maxWidth: 480, my: 'auto', borderRadius: 4,
    padding: { xs: '24px 18px', sm: '32px 32px' },
    display: 'flex', flexDirection: 'column', gap: 1.75, boxSizing: 'border-box',
  },
  header: { fontWeight: 800, color: '#1a237e', fontSize: '1.4rem' },
  text:   { color: '#444', fontSize: '0.9rem' },
  hint:   { color: '#666', fontSize: '0.8rem' },
  codes:  { fontFamily: 'monospace', fontSize: '1rem', background: '#f3f4fa', padding: '10px 12px',
            borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' },
  btn:    { background: '#1a237e', color: '#fff', borderRadius: 2, '&:hover': { background: '#283593' } },
  err:    { color: '#b71c1c', fontSize: '0.85rem' },
  ok:     { color: '#1b5e20', fontSize: '0.85rem' },
};

export default function SecurityPage() {
  const { state } = useAppContext();
  const [status, setStatus] = useState(null);
  // mode: 'idle' | 'phone' (entering number) | 'code' (entering the texted code) | 'off' (turning off)
  const [mode, setMode] = useState('idle');
  const [recovery, setRecovery] = useState(null);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await getFetch('/auth/mfa/status');
    if (res && res.results) setStatus(res.results);
  }, []);
  useEffect(() => { load(); }, [load]);

  const reset = () => { setMode('idle'); setPhone(''); setPassword(''); setCode(''); setError(''); };
  const fail = (res, fallback) => setError((res && res.error) || fallback);

  const sendCode = async () => {
    setBusy(true); setError(''); setMessage('');
    const res = await postFetch('/auth/mfa/phone/start', { phone, password });
    setBusy(false);
    if (res && !res.error) { setMode('code'); setCode(''); setMessage(`We texted a code to the number ending in ${res.phoneLast4}.`); }
    else fail(res, 'Could not send the text.');
  };

  const confirm = async () => {
    setBusy(true); setError('');
    const res = await postFetch('/auth/mfa/phone/confirm', { code });
    setBusy(false);
    if (res && !res.error) {
      if (res.recoveryCodes) setRecovery(res.recoveryCodes);
      reset(); setMessage('Two-step sign-in is on with this phone.'); load();
    } else fail(res, 'Could not confirm.');
  };

  const textMe = async () => {
    setBusy(true); setError(''); setMessage('');
    const res = await postFetch('/auth/mfa/code/send', {});
    setBusy(false);
    if (res && res.sent) setMessage('We texted you a code.'); else fail(res, 'Could not send the text.');
  };

  const turnOff = async () => {
    setBusy(true); setError('');
    const res = await postFetch('/auth/mfa/disable', { password, code });
    setBusy(false);
    if (res && res.message && !res.error) {
      forgetDeviceToken(state.user.userName);
      reset(); setMessage('Two-step sign-in is off.'); load();
    } else fail(res, 'Could not turn it off.');
  };

  const forget = async () => {
    setBusy(true); setError('');
    const res = await postFetch('/auth/mfa/devices/forget', {});
    setBusy(false);
    if (res && !res.error) { forgetDeviceToken(state.user.userName); setMessage('All remembered devices were forgotten.'); load(); }
    else fail(res, 'Could not forget devices.');
  };

  const phoneForm = (needPassword) => (
    <>
      <Typography sx={sxStyles.text}>
        Enter a US or Canadian mobile number. We will text a 6-digit code to it.
        Message and data rates may apply.
      </Typography>
      <TextField label="Mobile number" size="small" value={phone} autoFocus
        onChange={(e) => setPhone(e.target.value)} placeholder="(702) 555-0123"
        inputProps={{ inputMode: 'tel', autoComplete: 'tel' }} fullWidth />
      {needPassword && (
        <TextField label="Your password" type="password" size="small" value={password}
          onChange={(e) => setPassword(e.target.value)} fullWidth />
      )}
      <Button sx={sxStyles.btn} variant="contained" disabled={busy || !phone} onClick={sendCode}>Text me a code</Button>
      <Button onClick={reset}>Cancel</Button>
    </>
  );

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Typography sx={sxStyles.header}>Two-step sign-in</Typography>
        {!status && <Typography sx={sxStyles.text}>Loading…</Typography>}

        {status && !status.textMessagesAvailable && (
          <Typography sx={sxStyles.err}>
            Text messages are not set up on this server yet. The server owner needs to add the Twilio
            settings (see the README) before two-step sign-in can be turned on.
          </Typography>
        )}

        {recovery && (
          <>
            <Typography sx={sxStyles.ok}>Two-step sign-in is on.</Typography>
            <Typography sx={sxStyles.text}>
              Save these recovery codes somewhere safe. Each works once if you lose your phone.
              They will not be shown again.
            </Typography>
            <div style={sxStyles.codes}>{recovery.map((c) => <span key={c}>{c}</span>)}</div>
            <Button sx={sxStyles.btn} variant="contained" onClick={() => setRecovery(null)}>I have saved them</Button>
          </>
        )}

        {status && !recovery && mode === 'code' && (
          <>
            {message && <Typography sx={sxStyles.ok}>{message}</Typography>}
            <TextField label="6-digit code" size="small" value={code} autoFocus
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
              inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code' }} fullWidth />
            <Button sx={sxStyles.btn} variant="contained" disabled={busy || !code} onClick={confirm}>Confirm</Button>
            <Button onClick={reset}>Cancel</Button>
          </>
        )}

        {status && !recovery && mode === 'phone' && phoneForm(status.enabled)}

        {status && !recovery && mode === 'off' && (
          <>
            <Typography sx={sxStyles.text}>
              To turn it off, enter your password and a code. Press "Text me a code" first,
              or use a recovery code.
            </Typography>
            <TextField label="Password" type="password" size="small" value={password}
              onChange={(e) => setPassword(e.target.value)} fullWidth />
            {status.method === 'sms' && (
              <Button disabled={busy} onClick={textMe}>Text me a code</Button>
            )}
            <TextField label="Code or recovery code" size="small" value={code}
              onChange={(e) => setCode(e.target.value)} fullWidth />
            <Button variant="outlined" color="error" disabled={busy} onClick={turnOff}>Turn off</Button>
            <Button onClick={reset}>Cancel</Button>
            {message && <Typography sx={sxStyles.ok}>{message}</Typography>}
          </>
        )}

        {status && !recovery && mode === 'idle' && !status.enabled && (
          <>
            <Typography sx={sxStyles.text}>
              Adds a code texted to your phone to your password. It is required before you can use
              BGTracker health information. Works with US and Canadian mobile numbers.
            </Typography>
            {message && <Typography sx={sxStyles.ok}>{message}</Typography>}
            <Button sx={sxStyles.btn} variant="contained"
              disabled={!status.textMessagesAvailable} onClick={() => { setError(''); setMessage(''); setMode('phone'); }}>
              Turn on
            </Button>
          </>
        )}

        {status && !recovery && mode === 'idle' && status.enabled && (
          <>
            <Typography sx={sxStyles.ok}>Two-step sign-in is on.</Typography>
            {status.method === 'sms' ? (
              <Typography sx={sxStyles.text}>Codes are texted to the phone ending in {status.phoneLast4}.</Typography>
            ) : (
              <Typography sx={sxStyles.text}>
                You are using an authenticator app. You can switch to text messages below.
              </Typography>
            )}
            <Typography sx={sxStyles.hint}>
              Recovery codes left: {status.recoveryCodesLeft} · Remembered devices: {status.trustedDevices}
            </Typography>
            {message && <Typography sx={sxStyles.ok}>{message}</Typography>}
            <Button variant="outlined" disabled={!status.textMessagesAvailable}
              onClick={() => { setError(''); setMessage(''); setMode('phone'); }}>
              {status.method === 'sms' ? 'Change phone number' : 'Switch to text messages'}
            </Button>
            <Button variant="outlined" disabled={busy || status.trustedDevices === 0} onClick={forget}>
              Forget remembered devices
            </Button>
            <Button variant="outlined" color="error" onClick={() => { setError(''); setMessage(''); setMode('off'); }}>
              Turn off
            </Button>
          </>
        )}

        {error && <Typography sx={sxStyles.err}>{error}</Typography>}
      </Paper>
    </div>
  );
}
