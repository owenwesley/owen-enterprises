import React, { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import OtpInput from './OtpInput';

/**
 * Authenticator-app set-up: QR code (or typed key) -> type the first 6-digit code -> on.
 * The API calls are passed in, so this file has no knowledge of fetch, tokens or routes
 * (the page gives it the functions in client/src/utils/api.js).
 *
 * HIPAA Security Rule: 45 CFR 164.312(d) - the code proves the person really has the app before
 * two-step sign-in is switched on, so nobody is locked out by a typo in the key.
 * The secret is shown once, kept only in this component's state, and never written to storage.
 */

export interface TotpStartResult {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
  error?: string;
}
export interface TotpConfirmResult {
  message?: string;
  recoveryCodes?: string[];
  error?: string;
}
export interface TotpSetupProps {
  /** POST /auth/mfa/totp/start */
  startSetup: (password?: string) => Promise<TotpStartResult | null>;
  /** POST /auth/mfa/totp/confirm */
  confirmSetup: (code: string) => Promise<TotpConfirmResult | null>;
  /** True when two-step is already on (changing the method asks for the password again). */
  needPassword: boolean;
  /** Called once the app is confirmed; recoveryCodes only the first time two-step is turned on. */
  onEnabled: (recoveryCodes?: string[]) => void;
  onCancel: () => void;
  accentColor?: string;
}

const groupKey = (secret: string): string => secret.replace(/(.{4})/g, '$1 ').trim();

const TotpSetup: React.FC<TotpSetupProps> = ({ startSetup, confirmSetup, needPassword, onEnabled, onCancel, accentColor = '#1a237e' }) => {
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<TotpStartResult | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  const begin = useCallback(async () => {
    setBusy(true); setError('');
    const res = await startSetup(needPassword ? password : undefined);
    setBusy(false);
    if (res && !res.error && res.secret) setSetup(res);
    else setError((res && res.error) || 'Could not start the setup.');
  }, [startSetup, needPassword, password]);

  // First time on: no password needed, so show the QR code straight away.
  useEffect(() => {
    if (!needPassword && !started.current) { started.current = true; void begin(); }
  }, [needPassword, begin]);

  // Auto-submit target: called by OtpInput the moment the 6th digit lands.
  const submit = useCallback(async (digits: string) => {
    setBusy(true); setError('');
    const res = await confirmSetup(digits);
    setBusy(false);
    if (res && !res.error) { onEnabled(res.recoveryCodes); return; }
    setError((res && res.error) || 'That code is not right.');
    setCode('');                                  // clear so the same digits can be tried again and the squares reset
  }, [confirmSetup, onEnabled]);

  const copyKey = async () => {
    if (!setup) return;
    try { await navigator.clipboard.writeText(setup.secret); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard blocked: the key is on screen to type */ }
  };

  // Changing an existing method: ask for the password first.
  if (needPassword && !setup) {
    return (
      <>
        <Typography variant="body2" sx={{ color: '#444' }}>Enter your password to set up a new authenticator app.</Typography>
        <TextField label="Your password" type="password" size="small" value={password} autoFocus fullWidth
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && password) void begin(); }} />
        {error && <Typography role="alert" sx={{ color: '#b71c1c', fontSize: '0.85rem' }}>{error}</Typography>}
        <Button variant="contained" disabled={busy || !password} onClick={begin}
          sx={{ background: accentColor, '&:hover': { background: accentColor } }}>Continue</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </>
    );
  }

  if (!setup) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
        {error ? <Typography role="alert" sx={{ color: '#b71c1c', fontSize: '0.85rem' }}>{error}</Typography> : <CircularProgress size={28} />}
        <Button onClick={onCancel}>Cancel</Button>
      </Box>
    );
  }

  return (
    <>
      <Typography variant="body2" sx={{ color: '#444' }}>
        <strong>1.</strong> Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy,
        1Password, Bitwarden…) and scan this picture.
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Box component="img" src={setup.qrDataUrl} alt="QR code: scan it with your authenticator app"
          sx={{ width: 200, height: 200, borderRadius: 2, border: 1, borderColor: 'divider', p: 1, bgcolor: '#fff', boxSizing: 'content-box' }} />
      </Box>
      <Typography variant="caption" sx={{ color: '#666', textAlign: 'center' }}>
        Cannot scan? Choose “enter a setup key” in the app and type:
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography component="code" data-testid="setup-key"
          sx={{ fontFamily: 'monospace', fontSize: '0.95rem', bgcolor: '#f3f4fa', px: 1.5, py: 0.75, borderRadius: 1, letterSpacing: 1, wordBreak: 'break-all' }}>
          {groupKey(setup.secret)}
        </Typography>
        <Button size="small" onClick={copyKey}>{copied ? 'Copied' : 'Copy'}</Button>
      </Box>
      <Typography variant="body2" sx={{ color: '#444', mt: 1 }}>
        <strong>2.</strong> Type the 6-digit code the app shows. It is checked as soon as you type the last digit.
      </Typography>
      <OtpInput value={code} onChange={setCode} onComplete={submit} disabled={busy} error={Boolean(error) && code.length === 0}
        accentColor={accentColor} id="totp-setup-code" label="6-digit code from your authenticator app"
        describedBy={error ? 'totp-setup-error' : undefined} />
      <Box sx={{ minHeight: 24, textAlign: 'center' }} aria-live="polite">
        {busy && <CircularProgress size={18} />}
        {error && !busy && <Typography id="totp-setup-error" role="alert" sx={{ color: '#b71c1c', fontSize: '0.85rem' }}>{error}</Typography>}
      </Box>
      <Button onClick={onCancel}>Cancel</Button>
    </>
  );
};

export default TotpSetup;
