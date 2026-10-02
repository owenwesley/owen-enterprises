import React, { useEffect, useState } from 'react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { useAppContext } from '../../../context/AppContext';
import { useNutrition, NUTRIENT_FIELDS } from '../hooks/useNutrition';
import { nutritionSlotsFor } from '../components/Tables/nutritionColumns';
import NutritionTable from '../components/Tables/NutritionTable';
import { formatDate } from '../../../utils/dateFormat';

const sxStyles = {
  root:      { padding: 16, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 },
  toolbar:   { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  addBtn:    { backgroundColor: '#1a237e', color: '#fff', '&:hover': { backgroundColor: '#283593' } },
  field:     { marginBottom: 10 },
};

// `row` is the isolated edit draft (falls back to the stored row before any
// edit is made) — the dialog reads and writes only the draft, never the
// shared nutritions array directly, so a background refetch mid-edit can't
// retarget the dialog at the wrong row or wipe unsaved keystrokes.
function MealDialog({ open, row, slots, onClose, onChange, onSave }) {
  const [tab, setTab] = useState(0);
  if (!row) return null;
  // Only the meals the table shows (timesPD); clamp in case timesPD shrank.
  const slot = slots[Math.min(tab, slots.length - 1)];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Nutrition — {formatDate(row.date)}</DialogTitle>
      <Tabs value={Math.min(tab, slots.length - 1)} onChange={(e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        {slots.map((s) => <Tab key={s.key} label={s.label} />)}
      </Tabs>
      <DialogContent>
        {NUTRIENT_FIELDS.map((f) => {
          const field = `${f.key}${slot.key}`;
          return (
            <TextField
              key={field}
              label={f.label}
              type={f.type}
              value={row[field] ?? (f.type === 'number' ? 0 : '')}
              onChange={(e) => onChange(field, e.target.value)}
              fullWidth size="small" sx={sxStyles.field}
            />
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} variant="contained" style={{ backgroundColor: '#1a237e', color: '#fff' }}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function NutritionPage() {
  const { state } = useAppContext();
  const { user, preference } = state;
  const slots = nutritionSlotsFor(preference.timesPD);
  const {
    nutritions, editIdx, editDraft,
    getNutritions, addNutrition,
    handleNutritionChange, startEditing, stopEditing, cancelEditing,
  } = useNutrition();

  // dialogRowId is the row's database id, not an array index — the row can
  // safely be re-sorted or refetched in the background while the dialog is open.
  const [dialogRowId, setDialogRowId] = useState(null);

  useEffect(() => { if (user.id) getNutritions(); }, [user.id, getNutritions]);

  const openEdit = (rowId) => {
    startEditing(rowId);
    setDialogRowId(rowId);
  };

  const handleDialogChange = (field, value) => {
    handleNutritionChange({ target: { value } }, field, dialogRowId);
  };

  const handleSave = async () => {
    await stopEditing();
    setDialogRowId(null);
  };

  const handleClose = () => {
    cancelEditing();
    setDialogRowId(null);
  };

  const dialogRow = dialogRowId !== null
    ? (editDraft ?? nutritions.find((r) => r.id === dialogRowId))
    : null;

  return (
    <div style={sxStyles.root}>
      <div style={sxStyles.toolbar}>
        <Typography variant="h6" style={{ fontWeight: 700, color: '#1a237e' }}>
          Nutrition Log
        </Typography>
        <Button sx={sxStyles.addBtn} variant="contained" size="small" onClick={addNutrition}>
          + Add Day
        </Button>
      </div>

      <NutritionTable
        nutritions={nutritions}
        timesPD={preference.timesPD}
        editIdx={editIdx}
        editDraft={editDraft}
        onEdit={openEdit}
        onDateChange={(e, rowId) => handleNutritionChange(e, 'date', rowId)}
      />

      <MealDialog
        open={dialogRowId !== null}
        row={dialogRow}
        slots={slots}
        onClose={handleClose}
        onChange={handleDialogChange}
        onSave={handleSave}
      />
    </div>
  );
}
