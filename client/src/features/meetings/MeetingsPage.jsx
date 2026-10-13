import React, { useEffect, useRef, useState } from 'react';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Done';
import { useAppContext } from '../../context/AppContext';
import { formatDate, toDateInputValue } from '../../utils/dateFormat';
// Same edit-mode look the bgtracker tables use (highlighted row, banner).
import { stickyFirstColSx, twoRowHeaderSx, useHeaderRowOffset } from '../bgtracker/components/Styles';
import { editingRowSx, editingCellSx, editBannerSx } from '../bgtracker/components/Styles/editMode';
import {
  useMeetings, CHIP_COLS, MEDALLION_COLS,
  computeBalance, computeTotals,
} from './hooks/useMeetings';
import { useChairs } from './hooks/useChairs';
import { useMemos }  from './hooks/useMemos';
import { sendReport } from './utils/sendReport';
import { useMeetingReports } from './hooks/useMeetingReports';
import { useMeetingLogo, LOGO_CHANGED } from './hooks/useMeetingLogo';
import MeetingLogo from './components/MeetingLogo';
import ReportsBanner from './components/ReportsBanner';
import Alert from '@mui/material/Alert';
import { postFormData, deleteFetch, notifyError } from '../../utils/api';

const sxStyles = {
  root:      { padding: 16, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 },
  toolbar:   { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  container: { flex: '1 1 auto', minHeight: 0, maxHeight: '100%', overflowX: 'auto', overflowY: 'auto', ...stickyFirstColSx, ...twoRowHeaderSx },
  th: {
    backgroundColor: '#1a237e', color: '#fff',
    fontWeight: 700, whiteSpace: 'nowrap', padding: '6px 8px',
  },
  thGroup: {
    backgroundColor: '#283593', color: '#fff',
    fontWeight: 700, textAlign: 'center', padding: '4px 8px',
  },
  totalsRow:  { backgroundColor: '#e8eaf6' },
  balanceCol: { color: '#1b5e20', fontWeight: 700 },
  addBtn:   { backgroundColor: '#1a237e', color: '#fff', '&:hover': { backgroundColor: '#283593' } },
  resetBtn: { backgroundColor: '#b71c1c', color: '#fff', '&:hover': { backgroundColor: '#c62828' } },
  saveBtn:  { color: '#1a237e', cursor: 'pointer' },
  editBtn:  { color: '#555',    cursor: 'pointer' },
};

const CHAIR_COLS  = [
  { key: 'chair',   label: 'Chair',    wide: true,  dropdown: 'chairs' },
  { key: 'coChair', label: 'Co-Chair', wide: true,  dropdown: 'chairs' },
];
const ATTEND_COL  = { key: 'attendance', label: 'Attend.', wide: false };
const MEMO_COL    = { key: 'memo',       label: 'Memo',    wide: true, dropdown: 'memos' };
const DEPOSIT_COL = { key: 'deposit',    label: 'Deposit', wide: false };

// ── Cell renderer ──────────────────────────────────────────────────────────────
// Edit-mode inputs are labelled and typed the same way bgtracker's Row.jsx
// renders them (date picker, number field, text/select), so a meeting row
// edits like a reading row. Read-only cells stay plain text.
function MeetingCell({ editing, value, colKey, rowIdx, label, onChange, wide, isDate, dropdown, chairNames, memoNames, step }) {
  if (!editing) {
    return <span>{isDate ? formatDate(value) : (value === 0 || value ? value : '')}</span>;
  }

  if (isDate) {
    return (
      <TextField
        size="small"
        label={label}
        name={colKey}
        type="date"
        sx={{ width: 110 }}
        InputLabelProps={{ shrink: true }}
        value={toDateInputValue(value)}
        onChange={(e) => onChange(e, colKey, rowIdx)}
      />
    );
  }

  if (dropdown) {
    const options = dropdown === 'chairs' ? chairNames : memoNames;
    return (
      <TextField
        select
        size="small"
        label={label}
        name={colKey}
        sx={{ minWidth: 110 }}
        value={value || ''}
        onChange={(e) => onChange(e, colKey, rowIdx)}
      >
        {options.map((opt) => (
          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
        ))}
        {/* Always include the current value even if not in list */}
        {value && !options.includes(value) && (
          <MenuItem key={value} value={value}>{value}</MenuItem>
        )}
      </TextField>
    );
  }

  // Every remaining meeting column (chips, medallions, attendance, deposit) is numeric.
  return (
    <TextField
      size="small"
      label={label}
      name={colKey}
      type="number"
      sx={{ width: 80 }}
      inputProps={{ inputMode: 'numeric', step }}
      value={value ?? ''}
      onChange={(e) => onChange(e, colKey, rowIdx)}
    />
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function MeetingsPage() {
  const { state } = useAppContext();
  const { user } = state;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const logoInput = useRef(null);
  const { reports } = useMeetingReports();
  const { custom: hasOwnLogo } = useMeetingLogo();
  const headerRef = useHeaderRowOffset();

  const {
    meetings, editIdx, editDraft,
    getMeetings, addMeeting,
    handleMeetingChange, startEditing, stopEditing, cancelEditing,
    resetMeetings,
  } = useMeetings();

  const { chairNames, getChairs } = useChairs();
  const { memoNames, getMemos }   = useMemos();

  // Load all data on mount
  useEffect(() => {
    if (user.id) {
      getMeetings();
      getChairs();
      getMemos();
    }
  }, [user.id, getMeetings, getChairs, getMemos]);

  const rows   = computeBalance(meetings);
  const totals = computeTotals(meetings);

  const handleAdd = async () => { setBusy(true); await addMeeting();  setBusy(false); };
  const handleReset = async () => {
    if (!window.confirm('Reset period? This will clear all rows and carry over totals.')) return;
    setBusy(true); setNotice('');
    // 1.13.5: build the landscape PDF (with the meeting logo) and save it on the server. The table is reset
    // ONLY when the server confirms the save; any failure leaves every row untouched. The saved report then
    // waits (badge on the Meetings link + banner below) until the user prints or saves it.
    const name = await sendReport({ userId: user.id, rows, totals });
    if (name) {
      await resetMeetings();
      setNotice(`The table was reset. Your report "${name}" is ready to print or save (see the banner above the table).`);
    }
    setBusy(false);
  };
  const handleLogoFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) { notifyError('Choose a PNG, JPG or WebP picture.'); return; }
    if (file.size > 3 * 1024 * 1024) { notifyError('That picture is too large (3 MB at most).'); return; }
    setBusy(true);
    const form = new FormData();
    form.append('logo', file);
    const res = await postFormData(`/meetings/logo/${user.id}`, form);
    if (res && res.ok) window.dispatchEvent(new Event(LOGO_CHANGED));
    setBusy(false);
  };
  const handleLogoRemove = async () => {
    if (!window.confirm('Remove your meeting logo? The default logo will be used again.')) return;
    setBusy(true);
    const res = await deleteFetch(`/meetings/logo/${user.id}`);
    if (res && res.ok) window.dispatchEvent(new Event(LOGO_CHANGED));
    setBusy(false);
  };
  const handleStop = async () => { setBusy(true); await stopEditing(); setBusy(false); };
  const handleCancel = () => { cancelEditing(); };

  const cell = (col, row, rowId, editing) => (
    <TableCell key={col.key} align="center"
      sx={editing ? editingCellSx : undefined} style={editing ? undefined : { padding: '3px 5px' }}>
      <MeetingCell
        editing={editing}
        value={row[col.key]}
        colKey={col.key}
        rowIdx={rowId}
        label={col.label}
        onChange={handleMeetingChange}
        wide={col.wide}
        isDate={false}
        dropdown={col.dropdown}
        chairNames={chairNames}
        memoNames={memoNames}
        step={col.key === 'deposit' ? '0.01' : undefined}
      />
    </TableCell>
  );

  // Which row (if any) is being edited — for the banner, same idea as BGTable's.
  const editingRow = editIdx != null && editIdx !== -1 ? rows.find((r) => r.id === editIdx) : null;

  return (
    <div style={sxStyles.root}>
      {/* Toolbar */}
      <div style={sxStyles.toolbar}>
        <MeetingLogo size={36} />
        <Typography variant="h6" style={{ fontWeight: 700, color: '#1a237e' }}>Meetings</Typography>
        <Button sx={sxStyles.addBtn} variant="contained" size="small"
          onClick={handleAdd} disabled={busy}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : null}>
          + Add Meeting
        </Button>
        <Button sx={sxStyles.resetBtn} variant="contained" size="small"
          onClick={handleReset} disabled={busy}>
          Reset Period
        </Button>
        <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleLogoFile} />
        <Button size="small" variant="outlined" disabled={busy} onClick={() => logoInput.current && logoInput.current.click()}>
          {hasOwnLogo ? 'Change logo' : 'Add logo'}
        </Button>
        {hasOwnLogo && <Button size="small" variant="text" disabled={busy} onClick={handleLogoRemove}>Remove logo</Button>}
        <Typography variant="body2" sx={{ ml: { md: 'auto' }, width: { xs: '100%', md: 'auto' }, color: '#555' }}>
          Avg Attendance:&nbsp;<strong>{totals.avgAttendance}</strong>
          &nbsp;|&nbsp;Area Donation:&nbsp;<strong>${totals.areaDonation}</strong>
          &nbsp;|&nbsp;Balance:&nbsp;
          <strong>${rows.length ? rows[rows.length - 1].balance : '0.00'}</strong>
        </Typography>
      </div>

      {notice && <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setNotice('')}>{notice}</Alert>}
      <ReportsBanner userId={user.id} reports={reports} />

      {/* Table */}
      <Paper elevation={2}>
        {editingRow && (
          <Box sx={editBannerSx}>
            <EditIcon fontSize="small" />
            Editing meeting for {formatDate((editDraft ?? editingRow).date)} — unsaved changes;
            press ✓ on that row to save.
            <Box
              component="span"
              onClick={handleCancel}
              sx={{ ml: 'auto', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
            >
              Discard
            </Box>
          </Box>
        )}
        <TableContainer ref={headerRef} sx={sxStyles.container}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={sxStyles.th} rowSpan={2} style={{ verticalAlign: 'middle' }}>Date</TableCell>
                <TableCell sx={sxStyles.thGroup} colSpan={2}>Chairs</TableCell>
                <TableCell sx={sxStyles.thGroup} colSpan={CHIP_COLS.length}>Chips</TableCell>
                <TableCell sx={sxStyles.thGroup} colSpan={MEDALLION_COLS.length}>Medallions</TableCell>
                <TableCell sx={sxStyles.th} rowSpan={2}>Attend.</TableCell>
                <TableCell sx={sxStyles.th} rowSpan={2}>Memo</TableCell>
                <TableCell sx={sxStyles.th} rowSpan={2}>Deposit</TableCell>
                <TableCell sx={sxStyles.th} rowSpan={2}>Balance</TableCell>
                <TableCell sx={sxStyles.th} rowSpan={2} />
              </TableRow>
              <TableRow>
                {CHAIR_COLS.map((c)     => <TableCell key={c.key} sx={sxStyles.th}>{c.label}</TableCell>)}
                {CHIP_COLS.map((c)      => <TableCell key={c.key} sx={sxStyles.th}>{c.label}</TableCell>)}
                {MEDALLION_COLS.map((c) => <TableCell key={c.key} sx={sxStyles.th}>{c.label}</TableCell>)}
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((row) => {
                const editing = editIdx === row.id;
                // Merge the isolated draft over the stored (balance-annotated)
                // row so in-progress edits render without touching shared
                // state — same pattern as every other table in this app.
                const src = editing && editDraft ? { ...row, ...editDraft } : row;
                return (
                  <TableRow key={row.id} hover={!editing} sx={editing ? editingRowSx : undefined} className={editing ? 'row-editing' : undefined}>
                    {/* Date */}
                    <TableCell align="center"
                      sx={editing ? editingCellSx : undefined} style={editing ? undefined : { padding: '3px 5px' }}>
                      <MeetingCell editing={editing} value={src.date} colKey="date" label="Date"
                        rowIdx={row.id} onChange={handleMeetingChange} wide isDate />
                    </TableCell>

                    {CHAIR_COLS.map((c)      => cell(c, src, row.id, editing))}
                    {CHIP_COLS.map((c)       => cell(c, src, row.id, editing))}
                    {MEDALLION_COLS.map((c)  => cell(c, src, row.id, editing))}
                    {cell(ATTEND_COL, src, row.id, editing)}
                    {cell(MEMO_COL,   src, row.id, editing)}
                    {cell(DEPOSIT_COL,src, row.id, editing)}

                    <TableCell align="center" sx={{ ...sxStyles.balanceCol, ...(editing ? editingCellSx : {}) }}>${row.balance}</TableCell>

                    <TableCell align="center" sx={editing ? editingCellSx : undefined} style={{ whiteSpace: 'nowrap' }}>
                      {editing ? (
                        <Tooltip title="Save changes">
                          <SaveIcon sx={{ ...sxStyles.saveBtn, color: '#1b5e20' }} onClick={handleStop}
                            style={{ cursor: busy ? 'wait' : 'pointer' }} />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Edit this row">
                          <EditIcon sx={sxStyles.editBtn} onClick={() => startEditing(row.id)} />
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Totals row */}
              {rows.length > 0 && (
                <TableRow sx={sxStyles.totalsRow} className="totals-row">
                  <TableCell colSpan={3} style={{ fontWeight: 700, padding: '4px 8px' }}>TOTALS</TableCell>
                  {CHIP_COLS.map((c)      => <TableCell key={c.key} align="center" style={{ fontWeight: 700 }}>{totals[c.key]}</TableCell>)}
                  {MEDALLION_COLS.map((c) => <TableCell key={c.key} align="center" style={{ fontWeight: 700 }}>{totals[c.key]}</TableCell>)}
                  <TableCell align="center" style={{ fontWeight: 700 }}>{totals.attendance}</TableCell>
                  <TableCell />
                  <TableCell align="center" style={{ fontWeight: 700 }}>${totals.deposit}</TableCell>
                  <TableCell /><TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </div>
  );
}
