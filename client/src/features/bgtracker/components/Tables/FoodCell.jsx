import React, { useState } from 'react';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Tooltip from '@mui/material/Tooltip';
import SearchIcon from '@mui/icons-material/Search';
import { useAppContext } from '../../../../context/AppContext';
import { formatDate } from '../../../../utils/dateFormat';
import FoodLookupDialog from '../FoodLookupDialog';

/**
 * "What I ate" cell of the BG table (1.13.6), right after a meal's Sugar.
 *
 *   not editing  the food name already saved in that day's Nutrition row (read only)
 *   editing      a text box + a search button (or Enter). The dialog looks the foods up and shows the result;
 *                "Use these numbers" puts the carbs into this row's Carbs box and keeps the nutrition in the row's
 *                draft. Nothing reaches the database until the row's tick is pressed (useReadings.stopEditingReading).
 *                "Discard" therefore throws all of it away, carbs included.
 */
export default function FoodCell({ row, src, slot, editing, foodCtx }) {
  const { dispatch } = useAppContext();
  const [open, setOpen] = useState(false);
  const stored = (foodCtx && foodCtx.names && foodCtx.names.get(`${formatDate(row.date)}|${slot}`)) || '';

  if (!editing) {
    return <span title={stored} style={{ display: 'inline-block', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{stored}</span>;
  }

  const text = src[`foodText${slot}`] ?? stored;
  const setDraft = (name, value) => dispatch({ type: 'UPDATE_EDIT_DRAFT', payload: { name, value } });
  const canSearch = text.trim().length > 0;

  return (
    <>
      <TextField
        size="small"
        label="What I ate"
        sx={{ width: 170 }}
        value={text}
        onChange={(e) => {
          setDraft(`foodText${slot}`, e.target.value);
          if (src[`foodPending${slot}`]) setDraft(`foodPending${slot}`, null);   // text changed: the confirmed lookup no longer matches it
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && canSearch) { e.preventDefault(); setOpen(true); } }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title="Look up carbs and nutrition">
                <span>
                  <IconButton size="small" edge="end" aria-label="Look up this meal" disabled={!canSearch} onClick={() => setOpen(true)}>
                    <SearchIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />
      {open && (
        <FoodLookupDialog
          slot={slot}
          initialText={text}
          onClose={() => setOpen(false)}
          onUse={({ text: finalText, nutrients }) => {
            setDraft(`foodText${slot}`, finalText);
            setDraft(`carbs${slot}`, nutrients.carbs);
            setDraft(`foodPending${slot}`, { text: finalText, nutrients });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
