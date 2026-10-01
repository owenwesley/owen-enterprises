import React from 'react';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import EditIcon from '@mui/icons-material/Edit';
import { tableSx, useHeaderRowOffset, addReadingButtonSx } from '../Styles';
import { editBannerSx } from '../Styles/editMode';
import Row from './Row';

// ── Single-row header (timesPD 1 or 2) ───────────────────────────────────────
function FlatHeader({ columns, onAdd, readings }) {
  return (
    <TableHead>
      <TableRow>
        {columns.map((col, i) => (
          <TableCell key={i} align="center">{col.name}</TableCell>
        ))}
        <TableCell align="center">
          <Button sx={addReadingButtonSx(readings)} variant="contained" onClick={onAdd}>
            Add
          </Button>
        </TableCell>
      </TableRow>
    </TableHead>
  );
}

// ── Multi-row header (timesPD 3-5) — Date cell spans both rows ────────────────
function GroupedHeader({ groups, columns, onAdd, readings }) {
  return (
    <TableHead>
      {/* Row 1: Date (rowSpan 2, centred) | meal group labels | Add (rowSpan 2) */}
      <TableRow>
        <TableCell
          rowSpan={2}
          align="center"
          sx={{ verticalAlign: 'middle', fontWeight: 'bold' }}
        >
          Date
        </TableCell>
        {groups.map((g, i) => (
          <TableCell
            key={i}
            colSpan={g.cols.length}
            align="center"
            sx={{ fontWeight: 'bold', borderBottom: '1px solid rgba(224,224,224,1)' }}
          >
            {g.label}
          </TableCell>
        ))}
        <TableCell rowSpan={2} align="center">
          <Button sx={addReadingButtonSx(readings)} variant="contained" onClick={onAdd}>
            Add
          </Button>
        </TableCell>
      </TableRow>

      {/* Row 2: individual column names (Date and Add already spanned above) */}
      <TableRow>
        {groups.flatMap((g) =>
          g.cols.map((col, ci) => (
            <TableCell key={`${g.label}-${ci}`} align="center">
              {col.name}
            </TableCell>
          ))
        )}
      </TableRow>
    </TableHead>
  );
}

// ── Main BGTable component — column layout driven entirely by buildColumns(),
// which reads BGTracker preferences (timesPD, chkMeds*, chkInsulin, etc.)
// exactly the way the original Tables.jsx picked a table variant per
// preference combination — just computed dynamically instead of 50+
// hand-written table files.
export default function BGTable({
  rows = [],
  groups,
  columns,
  editIdx,
  onAdd,
  handleChange,
  startEditing,
  stopEditing,
  cancelEditing,
  editDraft,
  A1C,
}) {
  const isGrouped = groups && groups.length > 1;
  const headerRef = useHeaderRowOffset();

  // Rule 2: make Edit Mode unmistakable. The active row is highlighted in
  // Row.jsx; this banner covers the case where a long table has scrolled the
  // active row out of view, so the user always knows an edit is in progress
  // and exactly which date it applies to.
  const editingRow = editIdx != null && editIdx !== -1
    ? rows.find((r) => r.id === editIdx)
    : null;

  return (
    <Paper sx={tableSx.root}>
      {editingRow && (
        <Box sx={editBannerSx}>
          <EditIcon fontSize="small" />
          Editing reading for {(editDraft ?? editingRow).date} — unsaved changes;
          press ✓ on that row to save.
          {cancelEditing && (
            <Box
              component="span"
              onClick={cancelEditing}
              sx={{ ml: 'auto', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
            >
              Discard
            </Box>
          )}
        </Box>
      )}
      <TableContainer ref={headerRef} sx={tableSx.container}>
        <Table stickyHeader aria-label="blood glucose readings table">

          {isGrouped ? (
            <GroupedHeader
              groups={groups}
              columns={columns}
              onAdd={onAdd}
              readings={rows}
            />
          ) : (
            <FlatHeader
              columns={columns}
              onAdd={onAdd}
              readings={rows}
            />
          )}

          <TableBody>
            {rows.map((x, i) =>
              Row(
                x, i, rows, columns,
                handleChange, startEditing, stopEditing, editIdx, editDraft
              )
            )}
          </TableBody>

        </Table>
      </TableContainer>
    </Paper>
  );
}
