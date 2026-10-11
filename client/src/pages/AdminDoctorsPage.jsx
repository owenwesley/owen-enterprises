import React, { useCallback, useEffect, useState } from 'react';
import Paper from '@mui/material/Paper';
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
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import { getFetch, postFetch, putFetch, deleteFetch } from '../utils/api';
import AdminChurchesSection from './AdminChurchesSection';

const sxStyles = {
  wrapper: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: { xs: '16px 12px', sm: '24px' },
    boxSizing: 'border-box',
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
  },
  card: {
    width: '100%',
    maxWidth: 960,
    my: 'auto',
    borderRadius: 4,
    padding: { xs: '20px 14px', sm: '28px' },
    boxSizing: 'border-box',
  },
  header: { fontWeight: 800, color: '#1a237e', fontSize: '1.4rem', mb: 2 },
  meta:   { color: '#555', fontSize: '0.9rem' },
  actions: { display: 'flex', gap: 1, flexWrap: 'wrap' },
};

const STATUS_COLOR = { pending: 'warning', approved: 'success', rejected: 'error' };
const TYPE_LABEL = { clinic: 'Clinic', hospital: 'Hospital' };

export default function AdminDoctorsPage() {
  const [doctors, setDoctors] = useState(null);
  const [clinics, setClinics] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [newClinicName, setNewClinicName] = useState('');
  const [newClinicAddress, setNewClinicAddress] = useState('');
  const [newClinicType, setNewClinicType] = useState('clinic');
  const [addingClinic, setAddingClinic] = useState(false);
  const [clinicError, setClinicError] = useState('');
  const [clinicRequests, setClinicRequests] = useState(null);
  const [reqBusyId, setReqBusyId] = useState(null);
  const [editingClinicId, setEditingClinicId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editType, setEditType] = useState('clinic');
  const [clinicBusyId, setClinicBusyId] = useState(null);

  const load = useCallback(async () => {
    const [docData, clinicData, requestData] = await Promise.all([
      getFetch('/admin/doctors'),
      getFetch('/admin/clinics'),
      getFetch('/admin/clinic-requests'),
    ]);
    if (!docData) { setError('Server unreachable'); return; }
    if (docData.error) { setError(docData.error); return; }
    setError('');
    setDoctors(docData.results);
    if (clinicData && !clinicData.error) setClinics(clinicData.results);
    if (requestData && !requestData.error) setClinicRequests(requestData.results);
  }, []);

  useEffect(() => { load(); }, [load]);

  // A notice such as "Deleted clinic ..." is a one-off confirmation; let it
  // go away by itself instead of staying until the next status change.
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  const setStatus = async (doctor, status) => {
    // Leaving 'approved' also revokes this doctor's active patient links (see
    // routes/admin.js) — re-approving them later won't silently bring those
    // links back, patients would need to re-link. Worth a pause before the
    // click, not after.
    if (status !== 'approved') {
      const ok = window.confirm(
        `This will also revoke Dr. ${doctor.firstName} ${doctor.lastName}'s access to every patient ` +
        `currently linked to them. If this doctor is approved again later, those patients will need to ` +
        `link again with a new invite code. Continue?`
      );
      if (!ok) return;
    }
    setBusyId(doctor.id);
    setNotice('');
    const data = await postFetch(`/admin/doctors/${doctor.id}/status`, { status });
    setBusyId(null);
    if (!data || data.error) return;   // the global error toast already says why
    setError('');
    if (data.revokedLinks) {
      setNotice(`Also revoked ${data.revokedLinks} patient link(s) for Dr. ${doctor.firstName} ${doctor.lastName}.`);
    }
    // Optimistic-ish: just re-fetch, the list is small.
    load();
  };

  // A doctor's places: purely informational — none of these ever touch an
  // existing patient link. See the comment in routes/admin.js above the clinic routes.
  const placeCall = async (doctorId, fn) => {
    setBusyId(doctorId);
    const data = await fn();
    setBusyId(null);
    if (!data || data.error) return;   // the global error toast already says why
    setError('');
    load();
  };
  const addPlace = (doctorId, clinicId) =>
    clinicId && placeCall(doctorId, () => postFetch(`/admin/doctors/${doctorId}/clinics`, { clinic_id: clinicId }));
  const removePlace = (doctorId, clinicId) =>
    placeCall(doctorId, () => deleteFetch(`/admin/doctors/${doctorId}/clinics/${clinicId}`));
  const makePrimary = (doctorId, clinicId) =>
    placeCall(doctorId, () => postFetch(`/admin/doctors/${doctorId}/clinics/${clinicId}/primary`));

  const addClinic = async () => {
    const name = newClinicName.trim();
    if (!name) { setClinicError('Enter a name'); return; }
    setAddingClinic(true);
    setClinicError('');
    const data = await postFetch('/admin/clinics', { name, address: newClinicAddress.trim(), type: newClinicType });
    setAddingClinic(false);
    if (!data || data.error) return;   // the global error toast already says why
    setNewClinicName('');
    setNewClinicAddress('');
    setNewClinicType('clinic');
    load();
  };

  const startEditClinic = (c) => {
    setEditingClinicId(c.id);
    setEditName(c.name || '');
    setEditAddress(c.address || '');
    setEditType(c.type || 'clinic');
    setError('');
  };

  const cancelEditClinic = () => setEditingClinicId(null);

  const saveClinic = async (id) => {
    const name = editName.trim();
    if (!name) { setError('Name is required'); return; }
    setClinicBusyId(id);
    const data = await putFetch(`/admin/clinics/${id}`, { name, address: editAddress.trim(), type: editType });
    setClinicBusyId(null);
    if (!data || data.error) return;   // the global error toast already says why
    setError('');
    setEditingClinicId(null);
    load();
  };

  const deleteClinic = async (c) => {
    const n = (doctors || []).filter((d) => (d.clinics || []).some((x) => x.id === c.id)).length;
    const msg = n > 0
      ? `Delete "${c.name}"? ${n} doctor(s) will be detached from it. Their patients are not affected.`
      : `Delete "${c.name}"?`;
    if (!window.confirm(msg)) return;
    setClinicBusyId(c.id);
    const data = await deleteFetch(`/admin/clinics/${c.id}`);
    setClinicBusyId(null);
    if (!data || data.error) return;   // the global error toast already says why
    setError('');
    setNotice(`Deleted ${TYPE_LABEL[c.type] ? TYPE_LABEL[c.type].toLowerCase() : 'clinic'} "${c.name}".`);
    load();
  };

  const answerClinicRequest = async (r, verb) => {
    const key = `${r.doctorId}-${r.clinicId}`;
    setReqBusyId(key);
    setError('');
    const data = await postFetch(`/admin/clinic-requests/${r.doctorId}/${r.clinicId}/${verb}`);
    setReqBusyId(null);
    if (!data || data.error) return;   // the global error toast already says why
    load();
  };
  const approveClinicRequest = (r) => answerClinicRequest(r, 'approve');
  const rejectClinicRequest = (r) => answerClinicRequest(r, 'reject');

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Typography sx={sxStyles.header}>Doctor accounts</Typography>

        {error && <Typography sx={{ color: '#b71c1c', mb: 2 }}>{error}</Typography>}
        {notice && <Typography sx={{ color: '#1a237e', mb: 2 }}>{notice}</Typography>}
        {!doctors && !error && <Typography sx={sxStyles.meta}>Loading…</Typography>}

        <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>Add a clinic or hospital</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <TextField
            size="small" label="Name" value={newClinicName}
            onChange={(e) => setNewClinicName(e.target.value)}
            error={Boolean(clinicError)} helperText={clinicError}
            sx={{ flex: '1 1 180px' }}
          />
          <Select
            size="small" value={newClinicType} sx={{ minWidth: 120 }}
            onChange={(e) => setNewClinicType(e.target.value)}
            inputProps={{ 'aria-label': 'Type' }}
          >
            <MenuItem value="clinic">Clinic</MenuItem>
            <MenuItem value="hospital">Hospital</MenuItem>
          </Select>
          <TextField
            size="small" label="Address (optional)" value={newClinicAddress}
            onChange={(e) => setNewClinicAddress(e.target.value)}
            sx={{ flex: '1 1 220px' }}
          />
          <Button variant="outlined" disabled={addingClinic} onClick={addClinic}>
            {addingClinic ? 'Adding…' : 'Add'}
          </Button>
        </Box>

        {clinics && clinics.length > 0 && (
          <TableContainer sx={{ mt: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Address</TableCell>
                  <TableCell>Doctors</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {clinics.map((c) => {
                  const editing = editingClinicId === c.id;
                  const busy = clinicBusyId === c.id;
                  const count = (doctors || []).filter((d) => (d.clinics || []).some((x) => x.id === c.id)).length;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        {editing
                          ? <TextField size="small" value={editName} onChange={(e) => setEditName(e.target.value)} />
                          : c.name}
                      </TableCell>
                      <TableCell>
                        {editing
                          ? (
                            <Select size="small" value={editType} onChange={(e) => setEditType(e.target.value)}>
                              <MenuItem value="clinic">Clinic</MenuItem>
                              <MenuItem value="hospital">Hospital</MenuItem>
                            </Select>
                          )
                          : (TYPE_LABEL[c.type] || 'Clinic')}
                      </TableCell>
                      <TableCell>
                        {editing
                          ? <TextField size="small" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
                          : (c.address || '')}
                      </TableCell>
                      <TableCell>{count}</TableCell>
                      <TableCell>
                        <Box sx={sxStyles.actions}>
                          {editing ? (
                            <>
                              <Button size="small" variant="contained" disabled={busy} onClick={() => saveClinic(c.id)}>Save</Button>
                              <Button size="small" disabled={busy} onClick={cancelEditClinic}>Cancel</Button>
                            </>
                          ) : (
                            <>
                              <Button size="small" disabled={busy} onClick={() => startEditClinic(c)}>Edit</Button>
                              <Button size="small" color="error" disabled={busy} onClick={() => deleteClinic(c)}>Delete</Button>
                            </>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Divider sx={{ my: 1 }} />

        <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>
          Pending requests from doctors
        </Typography>
        {clinicRequests === null && <Typography sx={sxStyles.meta}>Loading…</Typography>}
        {clinicRequests && clinicRequests.length === 0 && (
          <Typography sx={sxStyles.meta}>No pending requests.</Typography>
        )}
        {clinicRequests && clinicRequests.length > 0 && (
          <TableContainer sx={{ mb: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Doctor</TableCell>
                  <TableCell>Request</TableCell>
                  <TableCell>Place</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clinicRequests.map((r) => {
                  const key = `${r.doctorId}-${r.clinicId}`;
                  return (
                    <TableRow key={key}>
                      <TableCell>Dr. {r.firstName} {r.lastName}</TableCell>
                      <TableCell>
                        <Chip size="small" color={r.action === 'remove' ? 'default' : 'info'}
                          label={r.action === 'remove' ? 'Leave' : 'Add'} />
                      </TableCell>
                      <TableCell>{r.clinicName} ({TYPE_LABEL[r.clinicType] || 'Clinic'})</TableCell>
                      <TableCell>
                        <Box sx={sxStyles.actions}>
                          <Button size="small" variant="contained" color="success"
                            disabled={reqBusyId === key} onClick={() => approveClinicRequest(r)}>
                            Approve
                          </Button>
                          <Button size="small" variant="outlined" color="error"
                            disabled={reqBusyId === key} onClick={() => rejectClinicRequest(r)}>
                            Reject
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Divider sx={{ my: 1 }} />

        {doctors && doctors.length === 0 && (
          <Typography sx={sxStyles.meta}>No doctor accounts have signed up yet.</Typography>
        )}

        {doctors && doctors.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Username / email</TableCell>
                  <TableCell>License</TableCell>
                  <TableCell>Clinics / hospitals</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {doctors.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>Dr. {d.firstName} {d.lastName}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{d.userName}</Typography>
                      <Typography variant="caption" sx={sxStyles.meta}>{d.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{d.licenseNumber}</Typography>
                      {d.specialty && <Typography variant="caption" sx={sxStyles.meta}>{d.specialty}</Typography>}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
                        {(d.clinics || []).length === 0 && (
                          <Typography variant="caption" sx={sxStyles.meta}>None</Typography>
                        )}
                        {(d.clinics || []).map((c) => (
                          <Tooltip key={c.id} title={c.isPrimary ? 'Primary place' : 'Click to make primary'}>
                            <Chip
                              size="small"
                              color={c.isPrimary ? 'primary' : 'default'}
                              variant={c.isPrimary ? 'filled' : 'outlined'}
                              label={`${c.name}${c.type === 'hospital' ? ' (hospital)' : ''}`}
                              onClick={c.isPrimary ? undefined : () => makePrimary(d.id, c.id)}
                              onDelete={() => removePlace(d.id, c.id)}
                              disabled={busyId === d.id}
                            />
                          </Tooltip>
                        ))}
                      </Box>
                      <Select
                        size="small" displayEmpty sx={{ minWidth: 160 }}
                        value=""
                        disabled={busyId === d.id || !clinics}
                        onChange={(e) => addPlace(d.id, e.target.value)}
                      >
                        <MenuItem value="">Add a place…</MenuItem>
                        {clinics && clinics
                          .filter((c) => !(d.clinics || []).some((x) => x.id === c.id))
                          .map((c) => (
                            <MenuItem key={c.id} value={c.id}>
                              {c.name}{c.type === 'hospital' ? ' (hospital)' : ''}
                            </MenuItem>
                          ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={STATUS_COLOR[d.doctorStatus] || 'default'} label={d.doctorStatus} />
                    </TableCell>
                    <TableCell>
                      <Box sx={sxStyles.actions}>
                        <Button size="small" variant="contained" color="success" disabled={busyId === d.id || d.doctorStatus === 'approved'}
                          onClick={() => setStatus(d, 'approved')}>
                          Approve
                        </Button>
                        <Button size="small" variant="outlined" color="error" disabled={busyId === d.id || d.doctorStatus === 'rejected'}
                          onClick={() => setStatus(d, 'rejected')}>
                          Reject
                        </Button>
                        {d.doctorStatus !== 'pending' && (
                          <Button size="small" variant="text" disabled={busyId === d.id}
                            onClick={() => setStatus(d, 'pending')}>
                            Reset to pending
                          </Button>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Divider sx={{ my: 2 }} />
        <AdminChurchesSection />
      </Paper>
    </div>
  );
}
