import React, { useEffect, useState } from 'react';
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
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import Input from '@mui/material/Input';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import { useAppContext } from '../../context/AppContext';
import { useContacts } from './hooks/useContacts';

const sxStyles = {
  root:    { padding: 16, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 },
  toolbar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  title:   { fontWeight: 700, color: '#4527a0', fontSize: '1.4rem', flexGrow: 1 },
  th:      { backgroundColor: '#4527a0', color: '#fff', fontWeight: 700 },
  addBtn:  { backgroundColor: '#4527a0', color: '#fff', '&:hover': { backgroundColor: '#5e35b1' } },
  field:   { marginBottom: 12 },
};

function ContactDialog({ open, contact, onClose, onChange, onSave }) {
  if (!contact) return null;
  const field = (label, key, type = 'text') => (
    <TextField
      key={key} label={label} type={type}
      value={contact[key] || ''}
      onChange={(e) => onChange(key, e.target.value)}
      fullWidth size="small" sx={sxStyles.field}
    />
  );
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{contact.id ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
      <DialogContent>
        {field('First Name', 'firstName')}
        {field('Last Name',  'lastName')}
        {field('Phone',      'phoneNum')}
        {field('Email',      'email', 'email')}
        {field('Address',    'address')}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} variant="contained" style={{ backgroundColor: '#4527a0', color: '#fff' }}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ContactsPage() {
  const { state } = useAppContext();
  const { user } = state;
  const {
    contacts, getContacts, addContact,
    handleContactChange, startEditingContact, stopEditingContact, deleteContact,
  } = useContacts();

  const [search,     setSearch]     = useState('');
  const [dialog,     setDialog]     = useState(null);
  const [newContact, setNewContact] = useState(null);

  useEffect(() => { if (user.id) getContacts(); }, [user.id, getContacts]);

  const filtered = contacts.filter((c) =>
    `${c.firstName} ${c.lastName} ${c.email} ${c.phoneNum}`.toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (i) => {
    startEditingContact(i);
    setDialog({ idx: i, contact: { ...contacts[i] } });
  };

  const handleDialogChange = (field, value) => {
    setDialog((d) => ({ ...d, contact: { ...d.contact, [field]: value } }));
    handleContactChange(field, value, dialog.idx);
  };

  const handleSave = async () => { await stopEditingContact(); setDialog(null); };

  const handleNewChange = (field, value) => setNewContact((c) => ({ ...c, [field]: value }));
  const handleAddSave   = async () => { await addContact(newContact); setNewContact(null); };

  return (
    <div style={sxStyles.root}>
      <div style={sxStyles.toolbar}>
        <Typography sx={sxStyles.title}>👤 Contacts</Typography>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts…"
          startAdornment={<InputAdornment position="start"><SearchIcon /></InputAdornment>}
          sx={{ flex: '1 1 200px', minWidth: 0 }}
        />
        <Button
          sx={sxStyles.addBtn}
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setNewContact({ firstName: '', lastName: '', phoneNum: '', email: '', address: '' })}
        >
          Add Contact
        </Button>
      </div>

      <Paper elevation={2}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={sxStyles.th}>First Name</TableCell>
                <TableCell sx={sxStyles.th}>Last Name</TableCell>
                <TableCell sx={sxStyles.th}>Phone</TableCell>
                <TableCell sx={sxStyles.th}>Email</TableCell>
                <TableCell sx={sxStyles.th}>Address</TableCell>
                <TableCell sx={sxStyles.th} align="center" style={{ width: 90 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((c, i) => (
                <TableRow key={c.id || i} hover>
                  <TableCell>{c.firstName}</TableCell>
                  <TableCell>{c.lastName}</TableCell>
                  <TableCell>{c.phoneNum}</TableCell>
                  <TableCell>{c.email}</TableCell>
                  <TableCell>{c.address}</TableCell>
                  <TableCell align="center">
                    <IconButton size="small" onClick={() => openEdit(i)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => deleteContact(i)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <ContactDialog open={!!dialog} contact={dialog?.contact}
        onClose={() => setDialog(null)} onChange={handleDialogChange} onSave={handleSave} />
      <ContactDialog open={!!newContact} contact={newContact}
        onClose={() => setNewContact(null)} onChange={handleNewChange} onSave={handleAddSave} />
    </div>
  );
}
