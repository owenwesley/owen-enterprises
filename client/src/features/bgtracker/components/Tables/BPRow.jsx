import React from 'react';
import './Rows.css';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Done';
import Tooltip from '@mui/material/Tooltip';
import { formatDate, toDateInputValue } from '../../../../utils/dateFormat';
import { editingRowSx, editingCellSx } from '../Styles/editMode';

const BPRow = (x, i, bloodpressures, header, handleChange, startEditing, stopEditing, editIdx, editDraft) => {
  // editIdx is the row's database id; inputs render from the isolated draft.
  const rowId = x.id;
  const editing = editIdx != null && editIdx === rowId;
  const src = editing && editDraft ? editDraft : x;

  return (
    <TableRow key={`tr-${rowId ?? i}`} sx={editing ? editingRowSx : undefined} className={editing ? 'row-editing' : undefined}>
      {header.map((y, k) => (
        <TableCell align="center" key={`trc-${k}`} sx={editing ? editingCellSx : undefined}>
          {editing && y.type === 'date' ? (
            <TextField
              size="small" label={y.name} sx={{ width: 110 }}
              name={y.prop}
              type="date"
              InputLabelProps={{ shrink: true }}
              value={toDateInputValue(src[y.prop])}
              onChange={(e) => handleChange(e, y.prop, rowId)}
            />
          ) : editing && y.type === 'number' ? (
            <TextField
              size="small" label={y.name} sx={{ width: 80 }}
              name={y.prop}
              type="number"
              value={src[y.prop] ?? ''}
              onChange={(e) => handleChange(e, y.prop, rowId)}
            />
          ) : editing ? (
            <TextField
              size="small" label={y.name} sx={{ width: 90 }}
              name={y.prop}
              type="text"
              value={src[y.prop] ?? ''}
              onChange={(e) => handleChange(e, y.prop, rowId)}
            />
          ) : y.type === 'date' ? (
            formatDate(x[y.prop])
          ) : (
            x[y.prop]
          )}
        </TableCell>
      ))}
      <TableCell align="center" sx={editing ? editingCellSx : undefined}>
        {editing ? (
          <Tooltip title="Save changes">
            <SaveIcon sx={{ cursor: 'pointer', color: '#1b5e20' }} onClick={() => stopEditing()} />
          </Tooltip>
        ) : (
          <Tooltip title="Edit this row">
            <EditIcon sx={{ cursor: 'pointer' }} onClick={() => startEditing(rowId)} />
          </Tooltip>
        )}
      </TableCell>
    </TableRow>
  );
};

export default BPRow;
