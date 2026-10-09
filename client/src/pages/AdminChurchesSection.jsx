import React, { useCallback, useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { getFetch, postFetch, deleteFetch } from '../utils/api';

// Admin list of churches (same job as `node db/approveChurch.js`; both still work).
// Rendered inside AdminDoctorsPage. Rejecting or suspending removes every
// non-owner member (so a later approval does not silently bring them back).

const STATUS_COLOR = { pending: 'warning', approved: 'success', rejected: 'error', suspended: 'default' };

export default function AdminChurchesSection() {
  const [churches, setChurches] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const data = await getFetch('/admin/churches');
    if (!data) { setError('Server unreachable'); return; }
    if (data.error) { setError(data.error); return; }
    setError('');
    setChurches(data.results);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  const setStatus = async (c, status) => {
    if ((status === 'rejected' || status === 'suspended') && c.active + c.pending > 1) {
      const ok = window.confirm(
        `This will remove every member of "${c.name}" except the owner. If the church is approved again ` +
        `later, people will need to ask to join again. Continue?`);
      if (!ok) return;
    }
    setBusyId(c.id);
    const data = await postFetch(`/admin/churches/${c.id}/status`, { status });
    setBusyId(null);
    if (!data || data.error) return;   // the global error toast already says why
    setNotice(data.removedMembers ? `${data.message}. ${data.removedMembers} member(s) removed.` : data.message);
    load();
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete "${c.name}" and all its member rows? This cannot be undone.`)) return;
    setBusyId(c.id);
    const data = await deleteFetch(`/admin/churches/${c.id}`);
    setBusyId(null);
    if (!data || data.error) return;
    setNotice(`Deleted church "${c.name}".`);
    load();
  };

  return (
    <Box sx={{ mt: 3 }}>
      <Typography sx={{ fontWeight: 800, color: '#1a237e', fontSize: '1.2rem', mb: 1 }}>Churches</Typography>
      {error && <Typography sx={{ color: '#b71c1c', mb: 1 }}>{error}</Typography>}
      {notice && <Typography sx={{ color: '#1a237e', mb: 1 }}>{notice}</Typography>}
      {!churches && !error && <Typography sx={{ color: '#555' }}>Loading…</Typography>}
      {churches && churches.length === 0 && <Typography sx={{ color: '#555' }}>No churches have been requested yet.</Typography>}
      {churches && churches.length > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Church</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell>Members</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {churches.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Typography variant="body2">{c.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#555' }}>#{c.id}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{c.ownerName || '?'}</Typography>
                    <Typography variant="caption" sx={{ color: '#555' }}>{c.ownerUserName}</Typography>
                  </TableCell>
                  <TableCell>{c.active} active{c.pending ? `, ${c.pending} waiting` : ''}</TableCell>
                  <TableCell><Chip size="small" color={STATUS_COLOR[c.status] || 'default'} label={c.status} /></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button size="small" variant="contained" color="success" disabled={busyId === c.id || c.status === 'approved'}
                        onClick={() => setStatus(c, 'approved')}>Approve</Button>
                      <Button size="small" variant="outlined" color="error" disabled={busyId === c.id || c.status === 'rejected'}
                        onClick={() => setStatus(c, 'rejected')}>Reject</Button>
                      {c.status === 'approved' && (
                        <Button size="small" variant="outlined" disabled={busyId === c.id}
                          onClick={() => setStatus(c, 'suspended')}>Suspend</Button>
                      )}
                      {(c.status === 'rejected' || c.status === 'suspended') && (
                        <Button size="small" variant="text" disabled={busyId === c.id}
                          onClick={() => setStatus(c, 'pending')}>Reset to pending</Button>
                      )}
                      <Button size="small" color="error" disabled={busyId === c.id} onClick={() => remove(c)}>Delete</Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
