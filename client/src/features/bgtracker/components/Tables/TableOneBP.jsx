import React from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import TableContainer from "@mui/material/TableContainer";
import BPRow from "./BPRow";
import Box from "@mui/material/Box";
import EditIcon from "@mui/icons-material/Edit";
import { tableSx, addButtonSx } from "../Styles";
import { editBannerSx } from "../Styles/editMode";

const TableOneBP = ({
  add,
  A1C,
  bloodpressures,
  header,
  handleChange,
  startEditing,
  stopEditing,
  editIdx,
  editDraft,
  cancelEditing,
}) => {
  const editingRow = editIdx != null && editIdx !== -1
    ? bloodpressures.find((r) => r.id === editIdx)
    : null;

  return (
    <Paper sx={tableSx.root}>
      {editingRow && (
        <Box sx={editBannerSx}>
          <EditIcon fontSize="small" />
          Editing blood pressure for {(editDraft ?? editingRow).date} — unsaved
          changes; press ✓ on that row to save.
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
      <TableContainer sx={tableSx.container}>
        <Table stickyHeader aria-label="sticky table">
          <TableHead>
            <TableRow>
              {header.map((x, i) => (
                <TableCell align="center" key={`thc-${i}`}>
                  {x.name}
                </TableCell>
              ))}
              <TableCell align="center">
                <Button
                  sx={addButtonSx}
                  variant="contained"
                  size="small"
                  onClick={add}
                >
                  Add
                </Button>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {bloodpressures.map((x, i) =>
              BPRow(
                x,
                i,
                bloodpressures,
                header,
                handleChange,
                startEditing,
                stopEditing,
                editIdx,
                editDraft
              )
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default TableOneBP;
