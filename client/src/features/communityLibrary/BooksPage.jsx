import React, { useEffect, useState } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import CardActions from '@mui/material/CardActions';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import InputAdornment from '@mui/material/InputAdornment';
import Input from '@mui/material/Input';
import { useBooks } from './hooks/useLibrary';
import { useContacts } from './hooks/useContacts';
import { useAppContext } from '../../context/AppContext';

const PLACEHOLDER = 'https://via.placeholder.com/140x200?text=No+Cover';

const sxStyles = {
  root:    { padding: 16, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 },
  toolbar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  title:   { fontWeight: 700, color: '#1b5e20', fontSize: '1.4rem', flexGrow: 1 },
  grid:    { display: 'flex', flexWrap: 'wrap', gap: 16 },
  card:    { width: 'calc(50% - 8px)', maxWidth: 160, display: 'flex', flexDirection: 'column', position: 'relative' },
  media:   { height: 200, objectFit: 'cover' },
  badge:   { position: 'absolute', top: 8, right: 8 },
  cardTitle:   { fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2 },
  cardAuthor:  { fontSize: '0.75rem', color: '#555' },
  field:   { marginBottom: 12 },
  addBtn:  { backgroundColor: '#1b5e20', color: '#fff', '&:hover': { backgroundColor: '#2e7d32' } },
  saveBtn: { backgroundColor: '#1565c0', color: '#fff' },
};

// ── io/lost conversions: DB stores 1/0, UI shows In/Out and Yes/No ────────────
const ioLabel   = (v) => (v === 1 || v === '1' || v === 'In'  ? 'In'  : 'Out');
const lostLabel = (v) => (v === 1 || v === '1' || v === 'Yes' ? 'Yes' : 'No');

function statusColor(io, lost) {
  if (lostLabel(lost) === 'Yes') return 'default';
  return ioLabel(io) === 'In' ? 'primary' : 'secondary';
}

// "Out: Wes Owen". Rows saved before the borrower fix may hold "In Library" as
// the borrower; show plain "Out" for those rather than "Out: In Library".
const outText = (b) => (b.who && b.who !== 'In Library' ? `Out: ${b.who}` : 'Out');

function BookDialog({ open, book, onClose, onChange, onSave, onFileSelect, contactNames }) {
  const [whoErr, setWhoErr] = useState(false);
  if (!book) return null;
  const io   = ioLabel(book.io);
  const lost = lostLabel(book.lost);
  const whoValue = contactNames.includes(book.who) ? book.who : '';

  // Out starts with nobody chosen; In always means "In Library".
  const handleStatusChange = (value) => {
    onChange('io', value);
    onChange('who', value === 'Out' ? '' : 'In Library');
    setWhoErr(false);
  };
  const trySave = () => {
    if (io === 'Out' && !whoValue) { setWhoErr(true); return; }
    setWhoErr(false);
    onSave();
  };

  const field = (label, key, type = 'text') => (
    <TextField
      key={key}
      label={label}
      value={book[key] || ''}
      onChange={(e) => onChange(key, e.target.value)}
      fullWidth
      size="small"
      type={type}
      sx={sxStyles.field}
    />
  );
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{book.id ? 'Edit Book' : 'Add Book'}</DialogTitle>
      <DialogContent>
        {field('Title',     'title')}
        {field('Author',    'author')}
        {field('Publisher', 'publisher')}
        {field('Copyright Year', 'copywrite')}
        {field('ISBN',      'isbn')}
        <div style={sxStyles.field}>
          <Typography variant="caption" style={{ display: 'block', marginBottom: 4, color: '#555' }}>
            Cover Image
          </Typography>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFileSelect && onFileSelect(e.target.files?.[0] || null)}
          />
          {book.img_url && (
            <img
              src={book.img_url}
              alt="cover preview"
              style={{ width: 60, height: 90, objectFit: 'cover', marginTop: 6, display: 'block', borderRadius: 4 }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
        </div>

        <TextField
          label="Status" select value={io}
          onChange={(e) => handleStatusChange(e.target.value)}
          fullWidth size="small" SelectProps={{ native: true }} sx={sxStyles.field}
        >
          {['In', 'Out'].map((v) => <option key={v} value={v}>{v}</option>)}
        </TextField>

        {io === 'Out' && (
          <TextField
            label="Checked out to" select value={whoValue}
            onChange={(e) => { onChange('who', e.target.value); setWhoErr(false); }}
            error={whoErr} helperText={whoErr ? 'Choose who has this book.' : ''}
            fullWidth size="small" SelectProps={{ native: true }} sx={sxStyles.field}
          >
            <option value="" disabled></option>
            {contactNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </TextField>
        )}

        <TextField
          label="Lost?" select value={lost}
          onChange={(e) => onChange('lost', e.target.value)}
          fullWidth size="small" SelectProps={{ native: true }} sx={sxStyles.field}
        >
          {['No', 'Yes'].map((v) => <option key={v} value={v}>{v}</option>)}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={trySave} sx={sxStyles.saveBtn} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function BooksPage() {
  const { state } = useAppContext();
  const { user } = state;
  const { books, getBooks, addBook, saveBook, uploadBookCover, deleteBook } = useBooks();
  const { contacts, getContacts } = useContacts();

  const [search,     setSearch]     = useState('');
  const [dialog,     setDialog]     = useState(null);
  const [newBook,    setNewBook]    = useState(null);
  const [editFile,   setEditFile]   = useState(null); // pending File object for the edit dialog
  const [newFile,    setNewFile]    = useState(null); // pending File object for the add dialog

  useEffect(() => { if (user.id) { getBooks(); getContacts(); } }, [user.id, getBooks, getContacts]);

  const contactNames = contacts.map((c) => `${c.firstName} ${c.lastName}`.trim());

  const filtered = books.filter((b) =>
    `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase())
  );

  // Index into `books` (not the filtered list), so search never edits or deletes the wrong book.
  const realIndex = (book) => books.findIndex((x) => x === book);

  const openEdit = (book) => {
    setEditFile(null);
    setDialog({ book: { ...book, io: ioLabel(book.io), lost: lostLabel(book.lost) } });
  };

  // The dialog holds the whole edited row, so save that row directly.
  const handleDialogChange = (field, value) => {
    setDialog((d) => ({ ...d, book: { ...d.book, [field]: value } }));
  };

  const handleSave = async () => {
    const bk = dialog.book;
    // Only upload when a new file was chosen or there is no cover yet: an
    // upload with no file overwrites the stored cover with the placeholder.
    const imgUrl = (editFile || !bk.img_url) ? await uploadBookCover(bk.title, editFile, null) : null;
    const err = await saveBook({ ...bk, img_url: imgUrl || bk.img_url });
    if (err) return; // server message is already shown; keep the dialog open
    setDialog(null);
    setEditFile(null);
  };

  const handleNewChange = (field, value) => setNewBook((b) => ({ ...b, [field]: value }));

  const handleAddSave = async () => {
    const imgUrl = await uploadBookCover(newBook.title, newFile, null);
    const err = await addBook({ ...newBook, img_url: imgUrl || '' });
    if (err) return;
    setNewBook(null);
    setNewFile(null);
  };

  return (
    <div style={sxStyles.root}>
      <div style={sxStyles.toolbar}>
        <Typography sx={sxStyles.title}>📚 Books</Typography>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or author…"
          startAdornment={<InputAdornment position="start"><SearchIcon /></InputAdornment>}
          sx={{ flex: '1 1 200px', minWidth: 0 }}
        />
        <Button
          sx={sxStyles.addBtn}
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setNewBook({ title:'', author:'', publisher:'', copywrite:'', isbn:'', io:'In', who:'', lost:'No', img_url:'' })}
        >
          Add Book
        </Button>
      </div>

      <div style={sxStyles.grid}>
        {filtered.map((book, k) => (
          <Card key={book.id || k} sx={sxStyles.card} elevation={3}>
            <CardMedia
              component="img"
              sx={sxStyles.media}
              image={book.img_url || PLACEHOLDER}
              alt={book.title}
              onError={(e) => { e.target.src = PLACEHOLDER; }}
            />
            <span style={sxStyles.badge}>
              <Chip
                size="small"
                label={lostLabel(book.lost) === 'Yes' ? 'Lost' : ioLabel(book.io)}
                color={statusColor(book.io, book.lost)}
              />
            </span>
            <CardContent style={{ padding: '8px 10px', flexGrow: 1 }}>
              <Typography sx={sxStyles.cardTitle}>{book.title}</Typography>
              <Typography sx={sxStyles.cardAuthor}>{book.author}</Typography>
              {ioLabel(book.io) === 'Out' && (
                <Typography style={{ fontSize: '0.72rem', color: '#b71c1c' }}>
                  {outText(book)}
                </Typography>
              )}
            </CardContent>
            <CardActions style={{ padding: '0 4px 4px' }}>
              <IconButton size="small" onClick={() => openEdit(book)}><EditIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => deleteBook(realIndex(book))}><DeleteIcon fontSize="small" /></IconButton>
            </CardActions>
          </Card>
        ))}
      </div>

      <BookDialog
        open={!!dialog}
        book={dialog?.book}
        onClose={() => setDialog(null)}
        onChange={handleDialogChange}
        onSave={handleSave}
        onFileSelect={setEditFile}
        contactNames={contactNames}
      />
      <BookDialog
        open={!!newBook}
        book={newBook}
        onClose={() => setNewBook(null)}
        onChange={handleNewChange}
        onSave={handleAddSave}
        onFileSelect={setNewFile}
        contactNames={contactNames}
      />
    </div>
  );
}
