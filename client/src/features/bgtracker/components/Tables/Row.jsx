import React from "react";
import "./Rows.css";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Done";
import Checkbox from "@mui/material/Checkbox";
import Tooltip from "@mui/material/Tooltip";
import { formatDate, toDateInputValue } from "../../../../utils/dateFormat";
import { editingRowSx, editingCellSx } from "../Styles/editMode";

const Row = (x, i, readings, header, handleChange, startEditing, stopEditing, editIdx, editDraft, rowTint) => {
  // editIdx holds the row's database id, not its array position — this keeps
  // editing correct even though the table renders a filtered subset.
  const rowId = x.id;
  const editing = editIdx != null && editIdx === rowId;

  // Rule 2: while editing, inputs render from the isolated draft so keystrokes
  // survive re-renders and filter recalculations. When not editing, render the
  // committed row.
  const src = editing && editDraft ? editDraft : x;

  // Optional tint (calorie goal): never while editing, where the edit highlight wins.
  const tint = !editing && rowTint ? rowTint(x) : undefined;
  const rowSx = editing ? editingRowSx : tint ? { backgroundColor: tint, '--row-tint': tint } : undefined;

  return (
    <TableRow key={`tr-${rowId ?? i}`} sx={rowSx} className={editing ? 'row-editing' : undefined}>
      {header.map((y, k) => (
        <TableCell
          align="center"
          key={`trc-${k}`}
          sx={editing ? editingCellSx : undefined}
        >
          {!editing && y.type === "checkbox" ? (
            <Checkbox name={y.prop} checked={Boolean(x[y.prop])} disabled />
          ) : editing && y.type === "checkbox" ? (
            <Checkbox
              name={y.prop}
              checked={Boolean(src[y.prop])}
              onChange={(e) => handleChange(e, y.prop, rowId)}
            />
          ) : editing && y.type === "date" ? (
            <TextField
              size="small"
              label={y.name}
              sx={{ width: 110 }}
              name={y.prop}
              type="date"
              InputLabelProps={{ shrink: true }}
              value={toDateInputValue(src[y.prop])}
              onChange={(e) => handleChange(e, y.prop, rowId)}
            />
          ) : editing && y.type === "number" ? (
            <TextField
              size="small"
              label={y.name}
              sx={{ width: 80 }}
              name={y.prop}
              type="number"
              inputProps={{ inputMode: "decimal", step: "any" }}
              value={src[y.prop] ?? ""}
              onChange={(e) => handleChange(e, y.prop, rowId)}
            />
          ) : editing ? (
            <TextField
              size="small"
              label={y.name}
              sx={{ width: 90 }}
              name={y.prop}
              type="text"
              value={src[y.prop] ?? ""}
              onChange={(e) => handleChange(e, y.prop, rowId)}
            />
          ) : y.type === "date" ? (
            formatDate(x[y.prop])
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
          <Tooltip title="Edit this row">
            <EditIcon
              sx={{ cursor: "pointer" }}
              onClick={() => startEditing(rowId)}
            />
          </Tooltip>
        )}
      </TableCell>
    </TableRow>
  );
};

export default Row;
