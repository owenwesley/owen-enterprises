import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import NativeSelect from '@mui/material/NativeSelect';
import Link from '@mui/material/Link';
import CloseIcon from '@mui/icons-material/Close';
import { useAppContext } from '../../../context/AppContext';
import { lookupFood, pickFood } from '../hooks/useFoodLookup';
import { NUTRITION_SLOTS } from './Tables/nutritionColumns';

const INT_KEYS = new Set(['calories', 'cholesterol', 'sodium', 'carbs', 'fiber', 'vitaminA', 'vitaminC', 'vitaminD', 'calcium', 'potassium']);
const round = (k, n) => (INT_KEYS.has(k) ? Math.round(n) : Math.round(n * 10) / 10);

// Adds up the nutrients of the foods that matched. The server sends every key on every matched item.
function sumItems(items) {
  const total = {};
  for (const it of items) {
    if (it.status !== 'matched' || it.removed) continue;
    for (const [k, v] of Object.entries(it.nutrients || {})) total[k] = (total[k] || 0) + (Number(v) || 0);
  }
  for (const k of Object.keys(total)) total[k] = round(k, total[k]);
  return total;
}

/**
 * The check-it-first screen of "What I ate" (1.13.6). It never saves anything itself: "Use these numbers" hands the
 * text and nutrition back to the BG table row (FoodCell), which saves them with the row.
 */
export default function FoodLookupDialog({ slot, initialText, onClose, onUse }) {
  const { state } = useAppContext();
  const userId = state.user.id;
  const usesSlidingScale = Number(state.preference.carbRatio) > 0;
  const mealName = (NUTRITION_SLOTS.find((s) => s.key === slot) || {}).label || '';

  const [text, setText] = useState(initialText || '');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const [carbsEdit, setCarbsEdit] = useState(null);   // the person's own carbs number, when they typed one
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const run = useCallback(async (t) => {
    if (!t.trim()) return;
    setBusy(true); setAsked(true); setCarbsEdit(null);
    const data = await lookupFood(userId, t);
    if (!alive.current) return;
    setItems(data ? data.items : []);
    setBusy(false);
  }, [userId]);

  useEffect(() => { run(initialText || ''); }, [run, initialText]);

  const change = async (idx, foodId) => {
    const it = items[idx];
    setBusy(true);
    const fresh = await pickFood(userId, foodId, it.qty, it.unit);
    if (!alive.current) return;
    if (fresh) setItems((cur) => cur.map((c, i) => (i === idx ? { ...c, ...fresh, candidates: c.candidates, removed: false } : c)));
    setBusy(false);
  };
  const remove = (idx) => { setCarbsEdit(null); setItems((cur) => cur.map((c, i) => (i === idx ? { ...c, removed: true } : c))); };

  const totals = useMemo(() => sumItems(items), [items]);
  const matched = items.filter((i) => i.status === 'matched' && !i.removed);
  const carbsNumber = carbsEdit !== null && carbsEdit !== '' ? Number(carbsEdit) : (totals.carbs || 0);
  const carbsOk = Number.isFinite(carbsNumber) && carbsNumber >= 0 && carbsNumber <= 2000;
  const canUse = matched.length > 0 && carbsOk;

  const use = () => onUse({ text: text.trim(), nutrients: { ...totals, carbs: Math.round(carbsNumber) } });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="food-dialog-title">
      <DialogTitle id="food-dialog-title">What I ate{mealName ? ` – ${mealName}` : ''}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            fullWidth size="small" label="What did you eat?" value={text} autoFocus
            placeholder="biscuits and gravy, 2 sausage links, 2 eggs"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(text); } }}
            inputProps={{ maxLength: 300 }}
          />
          <Button variant="outlined" disabled={busy || !text.trim()} onClick={() => run(text)}>Look up</Button>
        </Box>

        {busy && <Box sx={{ textAlign: 'center', my: 2 }}><CircularProgress size={28} /></Box>}

        {!busy && asked && items.length === 0 && (
          <Alert severity="warning">Nothing was found. Try different words, or close this and type the carbs yourself.</Alert>
        )}

        {items.map((it, idx) => (it.removed ? null : (
          <Box key={idx} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
              <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>You typed: “{it.text}”</Typography>
              <IconButton size="small" aria-label="Leave this food out" onClick={() => remove(idx)}><CloseIcon fontSize="small" /></IconButton>
            </Box>
            {it.status === 'matched' ? (
              <>
                <NativeSelect
                  fullWidth value={it.food.id} disabled={busy}
                  inputProps={{ 'aria-label': 'Which food' }}
                  onChange={(e) => change(idx, e.target.value)}
                >
                  {!it.candidates.some((c) => c.id === it.food.id) && <option value={it.food.id}>{it.food.name}{it.food.brand ? ` (${it.food.brand})` : ''}</option>}
                  {it.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.brand ? ` (${c.brand})` : ''}{c.per ? ` — per ${c.per}` : ''}{c.carbs !== null && c.carbs !== undefined ? `: ${c.carbs} g carbs` : ''}
                    </option>
                  ))}
                </NativeSelect>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  <strong>{it.nutrients.carbs} g carbs</strong> · {it.nutrients.calories} kcal · {it.nutrients.protein} g protein
                  <br />
                  <Typography component="span" variant="caption" color="text.secondary">
                    Amount used: {it.serving}{it.guess ? ' (the size you typed was not in the list, so check it)' : ''}
                  </Typography>
                </Typography>
              </>
            ) : (
              <Alert severity="warning" sx={{ mt: 0.5 }}>
                No match found. Rewrite it above and press Look up, or leave it out and add its carbs yourself below.
              </Alert>
            )}
          </Box>
        )))}

        {matched.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Total for this meal</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {totals.calories} kcal · {totals.protein} g protein · {totals.fiber} g fiber · {totals.sugars} g sugars
            </Typography>
            <TextField
              size="small" type="number" label="Carbs (g) for the BG table" sx={{ width: 220 }}
              value={carbsEdit !== null ? carbsEdit : (totals.carbs ?? 0)}
              onChange={(e) => setCarbsEdit(e.target.value)}
              inputProps={{ min: 0, max: 2000, step: 1, inputMode: 'decimal' }}
              error={!carbsOk} helperText="Change it if you know better than the estimate."
            />
          </Box>
        )}

        <Alert severity={usesSlidingScale ? 'warning' : 'info'} sx={{ mt: 2 }}>
          These are estimates from a food database, not your exact plate. Check the amounts
          {usesSlidingScale ? ' – your insulin dose is worked out from the carbs number, so a wrong carb count means a wrong dose' : ''}.
        </Alert>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Nutrition data from <Link href="https://www.fatsecret.com" target="_blank" rel="noopener noreferrer">fatsecret</Link>
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || !canUse} onClick={use}>Use these numbers</Button>
      </DialogActions>
    </Dialog>
  );
}
