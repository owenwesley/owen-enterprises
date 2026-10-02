import React, { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import EditIcon from '@mui/icons-material/Edit';
import { buildNutritionColumns, NUTRIENT_HEADERS } from './nutritionColumns';
import { dailyTotal } from '../../hooks/useNutrition';
import { formatDate, toDateInputValue } from '../../../../utils/dateFormat';

const PER_SLOT = NUTRIENT_HEADERS.length;
const SHADES = ['#1a237e', '#303f9f'];          // alternate per meal so groups read apart
const DATE_W = 150;

// First column of each meal gets a divider so the groups are easy to follow.
const isFirstOfSlot = (i) => i % PER_SLOT === 0;

const sx = {
  container: { overflowX: 'auto' },
  dateHead:  { backgroundColor: '#1a237e', color: '#fff', fontWeight: 700, position: 'sticky', left: 0, zIndex: 3, minWidth: DATE_W },
  dateCell:  { backgroundColor: '#fff', position: 'sticky', left: 0, zIndex: 2, minWidth: DATE_W, whiteSpace: 'nowrap' },
  head:      { color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' },
  totalHead: { backgroundColor: '#1b5e20', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' },
  totalCell: { fontWeight: 700, color: '#1b5e20' },
  editIcon:  { color: '#555', cursor: 'pointer', verticalAlign: 'middle', marginRight: 1 },
  divider:   { borderLeft: '2px solid #1a237e' },
  dividerHd: { borderLeft: '2px solid rgba(255,255,255,0.7)' },
};

/**
 * Nutrition table. The header follows `timesPD`: one meal group per active
 * slot (3 a day: Breakfast/Lunch/Dinner, 4: + Bedtime, 5: + Before Bed), each
 * group carrying the 18 nutrient columns, preceded by the day's totals.
 * Read-only: the pencil next to the date opens the edit dialog.
 */
export default function NutritionTable({
  nutritions, timesPD, editIdx, editDraft, onEdit, onDateChange,
}) {
  const { slots, groups, columns } = useMemo(() => buildNutritionColumns(timesPD), [timesPD]);

  return (
    <Paper elevation={2}>
      <TableContainer sx={sx.container}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell rowSpan={2} sx={sx.dateHead}>Date</TableCell>
              <TableCell colSpan={3} align="center" sx={sx.totalHead}>Day Total</TableCell>
              {groups.map((g, gi) => (
                <TableCell
                  key={g.key}
                  colSpan={g.span}
                  align="center"
                  sx={{ ...sx.head, backgroundColor: SHADES[gi % 2], ...sx.dividerHd }}
                >
                  {g.label}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell align="center" sx={sx.totalHead}>Calories</TableCell>
              <TableCell align="center" sx={sx.totalHead}>Carbs (g)</TableCell>
              <TableCell align="center" sx={sx.totalHead}>Protein (g)</TableCell>
              {columns.map((c, i) => (
                <TableCell
                  key={c.prop}
                  align={c.type === 'number' ? 'center' : 'left'}
                  sx={{
                    ...sx.head,
                    backgroundColor: SHADES[Math.floor(i / PER_SLOT) % 2],
                    ...(isFirstOfSlot(i) ? sx.dividerHd : null),
                  }}
                >
                  {c.name}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {nutritions.map((row) => {
              const editing = editIdx === row.id;
              const src = editing && editDraft ? editDraft : row;
              return (
                <TableRow key={row.id} hover>
                  <TableCell sx={sx.dateCell}>
                    {editing ? (
                      <TextField
                        size="small"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={toDateInputValue(src.date)}
                        onChange={(e) => onDateChange(e, row.id)}
                      />
                    ) : (
                      <>
                        <EditIcon sx={sx.editIcon} fontSize="small" onClick={() => onEdit(row.id)} />
                        {formatDate(row.date)}
                      </>
                    )}
                  </TableCell>
                  <TableCell align="center" sx={sx.totalCell}>
                    {dailyTotal(src, 'calories', slots).toFixed(0)}
                  </TableCell>
                  <TableCell align="center" sx={sx.totalCell}>
                    {dailyTotal(src, 'carbs', slots).toFixed(0)}g
                  </TableCell>
                  <TableCell align="center" sx={sx.totalCell}>
                    {dailyTotal(src, 'protein', slots).toFixed(1)}g
                  </TableCell>
                  {columns.map((c, i) => (
                    <TableCell
                      key={c.prop}
                      align={c.type === 'number' ? 'center' : 'left'}
                      sx={isFirstOfSlot(i) ? sx.divider : undefined}
                    >
                      {src[c.prop] ?? ''}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
