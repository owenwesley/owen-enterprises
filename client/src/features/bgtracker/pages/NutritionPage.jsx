import React, { useEffect, useState } from 'react';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import EditIcon from '@mui/icons-material/Edit';
import { useAppContext } from '../../../context/AppContext';
import { useNutrition, MEAL_SLOTS, NUTRIENT_FIELDS, dailyTotal } from '../hooks/useNutrition';
import { formatDate, toDateInputValue } from '../../../utils/dateFormat';

const sxStyles = {
  root:      { padding: 16, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 },
  toolbar:   { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  th:        { backgroundColor: '#1a237e', color: '#fff', fontWeight: 700 },
  addBtn:    { backgroundColor: '#1a237e', color: '#fff', '&:hover': { backgroundColor: '#283593' } },
  saveIcon:  { color: '#1a237e', cursor: 'pointer' },
  editIcon:  { color: '#555',    cursor: 'pointer' },
  field:     { marginBottom: 10 },
  totalCell: { fontWeight: 700, color: '#1b5e20' },
};

// `row` is the isolated edit draft (falls back to the stored row before any
// edit is made) — the dialog reads and writes only the draft, never the
// shared nutritions array directly, so a background refetch mid-edit can't
// retarget the dialog at the wrong row or wipe unsaved keystrokes.
function MealDialog({ open, row, onClose, onChange, onSave }) {
  const [tab, setTab] = useState(0);
  if (!row) return null;
  const slot = MEAL_SLOTS[tab];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Nutrition — {formatDate(row.date)}</DialogTitle>
      <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        {MEAL_SLOTS.map((s) => <Tab key={s.key} label={s.label} />)}
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
  const { user } = state;
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

      <Paper elevation={2}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={sxStyles.th}>Date</TableCell>
                <TableCell sx={sxStyles.th} align="center">Total Calories</TableCell>
                <TableCell sx={sxStyles.th} align="center">Total Carbs</TableCell>
                <TableCell sx={sxStyles.th} align="center">Total Protein</TableCell>
                <TableCell sx={sxStyles.th} align="center" style={{ width: 100 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {nutritions.map((row) => {
                const editing = editIdx === row.id;
                const src = editing && editDraft ? editDraft : row;
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      {editing ? (
                        <TextField
                          size="small"
                          type="date"
                          InputLabelProps={{ shrink: true }}
                          value={toDateInputValue(src.date)}
                          onChange={(e) => handleNutritionChange(e, 'date', row.id)}
                        />
                      ) : formatDate(row.date)}
                    </TableCell>
                    <TableCell align="center" sx={sxStyles.totalCell}>
                      {dailyTotal(row, 'calories').toFixed(0)}
                    </TableCell>
                    <TableCell align="center" sx={sxStyles.totalCell}>
                      {dailyTotal(row, 'carbs').toFixed(0)}g
                    </TableCell>
                    <TableCell align="center" sx={sxStyles.totalCell}>
                      {dailyTotal(row, 'protein').toFixed(1)}g
                    </TableCell>
                    <TableCell align="center">
                      <EditIcon sx={sxStyles.editIcon} onClick={() => openEdit(row.id)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <MealDialog
        open={dialogRowId !== null}
        row={dialogRow}
        onClose={handleClose}
        onChange={handleDialogChange}
        onSave={handleSave}
      />
    </div>
  );
}
