import React, { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import { alpha, keyframes } from '@mui/material/styles';

/**
 * OtpInput - six elegant squares, ONE real input.
 *
 * How it works: a single native <input> (inside an MUI TextField) is stretched over six decorative
 * squares and made invisible. The squares only DISPLAY what is in that input. Because the browser,
 * the phone's SMS autofill and password managers (Bitwarden, 1Password, ...) all see one ordinary
 * field with autocomplete="one-time-code", they fill it exactly like any other code box, and a
 * paste, an autofill and typing all go through the same onChange.
 *
 * - type="text" + inputMode="numeric": a number keypad on phones, yet "123 456" and leading zeros survive
 *   (type="number" would drop the zeros and break autofill).
 * - Non-digits are removed in onChange, so a letter never reaches state: the field "refuses" it at once
 *   (and the squares give a small shake).
 * - useEffect watches the value; the moment the last digit lands onComplete(code) is called once.
 *
 * HIPAA Security Rule note (45 CFR 164.312(d) person authentication): the code is held only in React
 * state for the moment it is typed; it is not logged, stored in browser storage or put in a URL.
 * autoComplete="one-time-code" lets the OS offer it from a text message without the page reading SMS.
 */

export interface OtpInputProps {
  /** The digits typed so far (controlled). Only 0-9, at most `length` characters. */
  value: string;
  onChange: (next: string) => void;
  /** Called ONCE when `value` reaches `length` digits (not again until the value is edited or cleared). */
  onComplete: (code: string) => void;
  length?: number;
  /** While verifying: the input is locked and the squares dim. */
  disabled?: boolean;
  /** Red squares (a wrong code). */
  error?: boolean;
  autoFocus?: boolean;
  /** Ring / filled-digit colour. Defaults to the theme's primary colour. */
  accentColor?: string;
  id?: string;
  name?: string;
  /** Accessible name of the input (screen readers read this; the squares are hidden from them). */
  label?: string;
  /** id of an element (hint or error text) that describes the field. */
  describedBy?: string;
}

const blink = keyframes`0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; }`;
const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }`;

/**
 * Turns whatever was typed, pasted or autofilled into digits.
 * "123 456", "123-456" and "٣٤٥" are not special; a pasted sentence such as
 * "Your code is 482913. Do not share it." yields the one 6-digit run, not every digit in it.
 */
export function extractDigits(raw: string, length: number): string {
  if (raw.length > length) {
    const run = raw.match(new RegExp(`(^|\\D)(\\d{${length}})(?!\\d)`));
    if (run) return run[2];
  }
  return raw.replace(/\D/g, '').slice(0, length);
}

const OtpInput: React.FC<OtpInputProps> = ({
  value, onChange, onComplete, length = 6, disabled = false, error = false, autoFocus = true,
  accentColor, id = 'otp-code', name = 'otp', label = 'Verification code', describedBy,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [shakeTick, setShakeTick] = useState(0);          // changes -> the squares are re-created -> animation replays
  const submitted = useRef('');                           // the code already handed to onComplete

  // ── auto-submit: the exact moment the last digit lands ────────────────────────────────────────
  useEffect(() => {
    if (value.length < length) { submitted.current = ''; return; }   // edited or cleared: allow the next submit
    if (disabled || submitted.current === value) return;             // locked, or this exact code was already sent
    submitted.current = value;
    onComplete(value);
  }, [value, length, disabled, onComplete]);

  // ── focus: on mount, and again after a verify attempt unlocks the field ───────────────────────
  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  // ── a wrong code from the server: shake once ──────────────────────────────────────────────────
  useEffect(() => { if (error) setShakeTick((n) => n + 1); }, [error]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const next = extractDigits(raw, length);
    // Something other than a digit (or the spaces and dashes people paste codes with) was refused.
    if (/[^\d\s-]/.test(raw)) setShakeTick((n) => n + 1);
    if (next !== value) onChange(next);
  }, [length, onChange, value]);

  // The caret always sits at the end: squares cannot show "the middle of the number".
  const keepCaretAtEnd = useCallback((e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (el.selectionStart !== el.value.length || el.selectionEnd !== el.value.length) {
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  const active = Math.min(value.length, length - 1);

  return (
    <Box
      sx={{ position: 'relative', width: '100%', maxWidth: (theme) => `calc(${length} * 56px + ${length - 1} * ${theme.spacing(1.5)})`, mx: 'auto' }}
      data-testid="otp-root"
    >
      {/* The six squares: decoration only (aria-hidden); the input below carries the meaning. */}
      <Box
        key={shakeTick}
        aria-hidden="true"
        sx={(theme) => ({
          display: 'flex',
          gap: { xs: theme.spacing(0.75), sm: theme.spacing(1.5) },
          width: '100%',
          opacity: disabled ? 0.6 : 1,
          transition: theme.transitions.create('opacity', { duration: theme.transitions.duration.shorter }),
          animation: shakeTick > 0 ? `${shake} 320ms ease-in-out` : 'none',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        })}
      >
        {Array.from({ length }, (_, i) => {
          const char = value[i] ?? '';
          const isActive = focused && !disabled && i === active;
          return (
            <Paper
              key={i}
              elevation={0}
              data-testid={`otp-box-${i}`}
              data-state={error ? 'error' : isActive ? 'active' : char ? 'filled' : 'empty'}
              sx={(theme) => {
                const accent = accentColor || theme.palette.primary.main;
                const ring = error ? theme.palette.error.main : accent;
                return {
                  flex: '1 1 0',
                  minWidth: 0,
                  maxWidth: 56,
                  aspectRatio: '1 / 1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  borderRadius: theme.spacing(1.5),
                  border: '1.5px solid',
                  borderColor: error ? theme.palette.error.main
                    : isActive ? accent
                      : char ? alpha(accent, 0.55)
                        : theme.palette.divider,
                  backgroundColor: error ? alpha(theme.palette.error.main, 0.04)
                    : char ? alpha(accent, 0.05)
                      : theme.palette.background.paper,
                  // Subtle resting shadow; the active square gets a soft focus ring on top of it.
                  boxShadow: isActive
                    ? `0 0 0 4px ${alpha(ring, 0.22)}, ${theme.shadows[2]}`
                    : error ? `0 0 0 2px ${alpha(ring, 0.12)}` : theme.shadows[1],
                  transform: isActive ? 'translateY(-1px)' : 'none',
                  transition: theme.transitions.create(['border-color', 'box-shadow', 'background-color', 'transform'],
                    { duration: theme.transitions.duration.shortest }),
                  fontSize: 'clamp(1.25rem, 6.5vw, 1.75rem)',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  fontFamily: theme.typography.fontFamily,
                  color: error ? theme.palette.error.main : theme.palette.text.primary,
                  userSelect: 'none',
                };
              }}
            >
              {char || (isActive && (
                <Box
                  component="span"
                  sx={(theme) => ({
                    width: 2, height: '1.1em', borderRadius: 1,
                    backgroundColor: accentColor || theme.palette.primary.main,
                    animation: `${blink} 1.1s step-end infinite`,
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                  })}
                />
              ))}
            </Paper>
          );
        })}
      </Box>

      {/* The ONE real input, invisible, layered over the squares. Clicking a square focuses it. */}
      <TextField
        value={value}
        onChange={handleChange}
        disabled={disabled}
        variant="standard"
        fullWidth
        inputRef={inputRef}
        InputProps={{ disableUnderline: true }}
        inputProps={{
          id,
          name,
          type: 'text',                       // not "number": keeps leading zeros and lets autofill write "012345"
          inputMode: 'numeric',               // number pad on phones
          autoComplete: 'one-time-code',      // SMS autofill (iOS/Android) and password-manager TOTP fill
          pattern: '[0-9]*',
          autoCapitalize: 'off',
          autoCorrect: 'off',
          spellCheck: false,
          enterKeyHint: 'done',
          'aria-label': label,
          'aria-invalid': error || undefined,
          'aria-describedby': describedBy,
          'data-testid': 'otp-input',
          onFocus: (e: React.FocusEvent<HTMLInputElement>) => { setFocused(true); keepCaretAtEnd(e); },
          onBlur: () => setFocused(false),
          onSelect: keepCaretAtEnd,
          onClick: keepCaretAtEnd,
        }}
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          '& .MuiInputBase-root': { height: '100%', cursor: 'text' },
          '& input': {
            height: '100%',
            padding: 0,
            // Invisible but real. font-size stays >= 16px so iOS does not zoom the page on focus.
            fontSize: '1.75rem',
            color: 'transparent',
            WebkitTextFillColor: 'transparent',
            caretColor: 'transparent',
            background: 'transparent',
            '&::selection': { background: 'transparent' },
            // Browsers paint autofilled fields yellow/blue: keep it see-through so the squares show.
            '&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus': {
              WebkitTextFillColor: 'transparent',
              WebkitBoxShadow: '0 0 0 100px transparent inset',
              transition: 'background-color 99999s ease-in-out 0s',
            },
          },
        }}
      />
    </Box>
  );
};

export default OtpInput;
