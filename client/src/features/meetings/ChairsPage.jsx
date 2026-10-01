import React, { useEffect } from 'react';
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
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Done';
import CloseIcon from '@mui/icons-material/Close';
import { useAppContext } from '../../context/AppContext';
import { useChairs } from './hooks/useChairs';

const sxStyles = {
  root:    { padding: 16, maxWidth: 480, margin: '32px auto', height: '100%', overflowY: 'auto', minHeight: 0 },
  toolbar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
  th:      { backgroundColor: '#1a237e', color: '#fff', fontWeight: 700 },
  addBtn:  { backgroundColor: '#1a237e', color: '#fff', '&:hover': { backgroundColor: '#283593' } },
  saveIcon:{ color: '#1a237e', cursor: 'pointer' },
  editIcon:{ color: '#555',    cursor: 'pointer' },
  delIcon: { color: '#b71c1c', cursor: 'pointer' },
};

export default function ChairsPage() {
  const { state } = useAppContext();
  const { user } = state;
  const {
    chairs, editIdx, editDraft,
    getChairs, addChair,
    handleChairChange, startEditingChair, stopEditingChair,
    cancelEditingChair,
  } = useChairs();

  useEffect(() => { if (user.id) getChairs(); }, [user.id, getChairs]);

  return (
    <div style={sxStyles.root}>
      <div style={sxStyles.toolbar}>
        <Typography variant="h6" style={{ fontWeight: 700, color: '#1a237e', flexGrow: 1 }}>
          Chairs / Co-Chairs
        </Typography>
        <Button sx={sxStyles.addBtn} variant="contained" size="small" onClick={addChair}>
          + Add
        </Button>
      </div>

      <Paper elevation={2}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={sxStyles.th}>Name</TableCell>
                <TableCell sx={sxStyles.th} align="center" style={{ width: 80 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {chairs.map((chair) => {
                const editing = editIdx === chair.id;
                const src = editing && editDraft ? editDraft : chair;
                return (
                  <TableRow key={chair.id} hover>
                    <TableCell>
                      {editing ? (
                        <TextField
                          fullWidth size="small"
                          value={src.name}
                          onChange={(e) => handleChairChange('name', e.target.value, chair.id)}
                        />
                      ) : chair.name}
                    </TableCell>
                    <TableCell align="center">
                      {editing
                        ? <>
                            <SaveIcon sx={sxStyles.saveIcon} onClick={stopEditingChair} />
                            <CloseIcon sx={sxStyles.delIcon} onClick={cancelEditingChair} style={{ marginLeft: 6 }} />
                          </>
                        : <EditIcon sx={sxStyles.editIcon} onClick={() => startEditingChair(chair.id)} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </div>
  );
}
