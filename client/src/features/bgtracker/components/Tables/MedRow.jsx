import React from "react";
import "./Rows.css";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Done";
import { editingRowSx, editingCellSx } from "../Styles/editMode";

const MedRow = (
  x,
  i,
  medications,
  header,
  handleChange,
  handleDelete,
  startEditing,
  stopEditing,
  editIdx,
  editDraft
) => {
  // editIdx is the row's database id; inputs render from the isolated draft.
  const rowId = x.id;
  const editing = editIdx != null && editIdx === rowId;
  const src = editing && editDraft ? editDraft : x;

  return (
    <TableRow key={`tr-${rowId ?? i}`} sx={editing ? editingRowSx : undefined} className={editing ? 'row-editing' : undefined}>
      {header.map((y, k) => (
        <TableCell
          align="center"
          key={`trc-${k}`}
          sx={editing ? editingCellSx : undefined}
        >
          {editing ? (
            <TextField
              size="small"
              label={y.name}
              // `type` comes from the column definition, so numeric columns
              // render numeric inputs and text columns render text inputs.
              type={y.type}
              inputProps={y.type === "number" ? { inputMode: "numeric" } : undefined}
              sx={{ width: y.type === "number" ? 80 : 110 }}
              autoComplete="off"
              name={y.prop}
              value={src[y.prop] ?? ''}
              onChange={(e) => handleChange(e, y.prop, rowId)}
            />
          ) : (
            x[y.prop]
          )}
        </TableCell>
      ))}

      <TableCell align="center" sx={editing ? editingCellSx : undefined}>
        {editing ? (
          <Tooltip title="Save changes">
            <SaveIcon
              sx={{ cursor: "pointer", color: "#1b5e20" }}
              onClick={() => stopEditing()}
            />
          </Tooltip>
        ) : (
          <Tooltip title="Edit this medication">
            <EditIcon sx={{ cursor: "pointer" }} onClick={() => startEditing(rowId)} />
          </Tooltip>
        )}
      </TableCell>

      {/* Medications is the one table that keeps a delete action. */}
      <TableCell align="center" sx={editing ? editingCellSx : undefined}>
        <Tooltip title="Delete this medication">
          <DeleteIcon
            sx={{ cursor: "pointer", color: "#b71c1c" }}
            onClick={() => handleDelete(rowId)}
          />
        </Tooltip>
      </TableCell>
    </TableRow>
  );
};

export default MedRow;
