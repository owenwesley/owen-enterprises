import React, { useEffect, useState } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import CardActions from '@mui/material/CardActions';
import Collapse from '@mui/material/Collapse';
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Input from '@mui/material/Input';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { useAppContext } from '../../context/AppContext';
import { useMovies, isCollection, collectionSlots, emptyMovie } from './hooks/useMovies';
import { useContacts } from './hooks/useContacts';

const PLACEHOLDER  = 'https://via.placeholder.com/140x200?text=No+Poster';
const MEDIA_TYPES  = ['VHS', 'DVD', 'HD-DVD', 'Blu-Ray'];
const RATINGS      = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'];
const FEATURE_TYPES = ['Double Feature', 'Triple Feature', 'Quadruple Feature', 'Box Set'];

const sxStyles = {
  root:      { padding: 16, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 },
  section:   { marginBottom: 32 },
  sectionTitle: { fontWeight: 700, color: '#4a148c', fontSize: '1.2rem', marginBottom: 12 },
  toolbar:   { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  title:     { fontWeight: 700, color: '#4a148c', fontSize: '1.4rem', flexGrow: 1 },
  grid:      { display: 'flex', flexWrap: 'wrap', gap: 16 },
  card:      { width: 'calc(50% - 8px)', maxWidth: 180, display: 'flex', flexDirection: 'column', position: 'relative' },
  media:     { height: 200, objectFit: 'cover' },
  badge:     { position: 'absolute', top: 8, right: 8 },
  badgeMedia:{ position: 'absolute', top: 8, left: 8 },
  cardTitle: { fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2 },
  cardSub:   { fontSize: '0.72rem', color: '#555' },
  field:     { marginBottom: 12 },
  addBtn:    { backgroundColor: '#4a148c', color: '#fff', '&:hover': { backgroundColor: '#6a1b9a' } },
  saveBtn:   { backgroundColor: '#1565c0', color: '#fff' },
  slotRow:   { fontSize: '0.75rem', padding: '2px 0', borderBottom: '1px solid #eee' },
  expandBtn: { marginLeft: 'auto' },
};

// ── io/lost conversions: DB stores 1/0, UI shows In/Out and Yes/No ────────────
const ioLabel   = (v) => (v === 1 || v === '1' || v === 'In'  ? 'In'  : 'Out');
const lostLabel = (v) => (v === 1 || v === '1' || v === 'Yes' ? 'Yes' : 'No');

function mediaColor(media) {
  const m = { VHS: '#555', DVD: '#1565c0', 'HD-DVD': '#2e7d32', 'Blu-Ray': '#6a1b9a' };
  return m[media] || '#555';
}

// ── Feature-type → required slot-count rule table ─────────────────────────────
// Single = 1, Double = 2, Triple = 3, Quadruple = 4, Box Set = user-chosen 5–12.
const FIXED_SLOT_COUNTS = {
  '':                   1, // no selection = single movie
  'Double Feature':     2,
  'Triple Feature':     3,
  'Quadruple Feature':  4,
};
const BOXSET_MIN = 5;
const BOXSET_MAX = 12;

/**
 * Returns the number of movie-info slots required for a given featureMedia
 * value. For 'Box Set' this returns the user's chosen count (clamped to
 * 5–12), falling back to the minimum (5) until they've entered one.
 */
function requiredSlotCount(featureMedia, numMovie) {
  if (featureMedia === 'Box Set') {
    const n = parseInt(numMovie, 10);
    if (!Number.isInteger(n)) return BOXSET_MIN;
    return Math.min(BOXSET_MAX, Math.max(BOXSET_MIN, n));
  }
  return FIXED_SLOT_COUNTS[featureMedia] ?? 1;
}

// ── Edit/Add dialog — tabs for single-movie vs collection mode ────────────────
function MovieDialog({ open, movie, onClose, onChange, onSave, onFileSelect, contactNames }) {
  const [slotTab, setSlotTab] = useState(0);
  if (!movie) return null;

  const slotCount = requiredSlotCount(movie.featureMedia, movie.numMovie);
  const io   = ioLabel(movie.io);
  const lost = lostLabel(movie.lost);

  // Clamp the active tab if a feature-type change shrinks the slot count
  // below the tab currently being viewed (e.g. Box Set 8 → Double Feature).
  if (slotTab >= slotCount) {
    setSlotTab(0);
  }

  /**
   * When the feature type changes, immediately recompute and store the
   * correct numMovie so the dialog and the saved row always agree —
   * this is what previously let a "Single" ship with numMovie: 7.
   */
  const handleFeatureTypeChange = (value) => {
    onChange('featureMedia', value);
    const nextCount = requiredSlotCount(value, movie.numMovie);
    onChange('numMovie', nextCount);
  };

  const handleBoxSetCountChange = (value) => {
    const clamped = Math.min(BOXSET_MAX, Math.max(BOXSET_MIN, parseInt(value, 10) || BOXSET_MIN));
    onChange('numMovie', clamped);
  };

  const field = (label, key, type = 'text', onSlot = null) => {
    const target = onSlot || key;
    return (
      <TextField
        key={target} label={label} type={type}
        value={movie[target] ?? (type === 'number' ? 0 : '')}
        onChange={(e) => onChange(target, e.target.value)}
        fullWidth size="small" sx={sxStyles.field}
      />
    );
  };
  const sel = (label, key, opts, onSlot = null) => {
    const target = onSlot || key;
    return (
      <TextField
        key={target} label={label} select value={movie[target] || opts[0]}
        onChange={(e) => onChange(target, e.target.value)}
        fullWidth size="small" SelectProps={{ native: true }} sx={sxStyles.field}
      >
        {opts.map((v) => <option key={v} value={v}>{v}</option>)}
      </TextField>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{movie.id ? 'Edit Movie' : 'Add Movie'}</DialogTitle>
      <DialogContent>
        {field('Title', 'name')}

        {/* Feature type — selecting this immediately fixes the slot count per the rule table */}
        <TextField
          label="Feature Type" select value={movie.featureMedia || ''}
          onChange={(e) => handleFeatureTypeChange(e.target.value)}
          fullWidth size="small" SelectProps={{ native: true }} sx={sxStyles.field}
        >
          <option value="">Single</option>
          {FEATURE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
        </TextField>

        {/* Box Set only: ask the user how many films (5–12), used verbatim as the slot count */}
        {movie.featureMedia === 'Box Set' && (
          <TextField
            label={`Number of films (${BOXSET_MIN}–${BOXSET_MAX})`} type="number"
            value={movie.numMovie || BOXSET_MIN}
            inputProps={{ min: BOXSET_MIN, max: BOXSET_MAX }}
            onChange={(e) => handleBoxSetCountChange(e.target.value)}
            fullWidth size="small" sx={sxStyles.field}
          />
        )}

        {slotCount > 1 ? (
          <>
            <Tabs value={slotTab} onChange={(e, v) => setSlotTab(v)} variant="scrollable" scrollButtons="auto">
              {Array.from({ length: slotCount }, (_, i) => (
                <Tab key={i} label={`Film ${i + 1}`} />
              ))}
            </Tabs>
            {field('Title',    'name',   'text',   `name${slotTab + 1}`)}
            {sel('Rating',     'rated',  RATINGS,  `rated${slotTab + 1}`)}
            {field('Length (min)', 'length', 'number', `length${slotTab + 1}`)}
            {field('Year',     'yearR',  'number', `yearR${slotTab + 1}`)}
            {sel('Media',      'media',  MEDIA_TYPES, `media${slotTab + 1}`)}
          </>
        ) : (
          <>
            {sel('Rating', 'rated1', RATINGS)}
            {field('Length (min)', 'length1', 'number')}
            {field('Year', 'yearR1', 'number')}
            {sel('Media', 'media1', MEDIA_TYPES)}
          </>
        )}

        <div style={sxStyles.field}>
          <Typography variant="caption" style={{ display: 'block', marginBottom: 4, color: '#555' }}>
            Poster Image
          </Typography>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFileSelect && onFileSelect(e.target.files?.[0] || null)}
          />
          {movie.img_url && (
            <img
              src={movie.img_url}
              alt="poster preview"
              style={{ width: 60, height: 90, objectFit: 'cover', marginTop: 6, display: 'block', borderRadius: 4 }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
        </div>

        <TextField
          label="Status" select value={io}
          onChange={(e) => onChange('io', e.target.value)}
          fullWidth size="small" SelectProps={{ native: true }} sx={sxStyles.field}
        >
          {['In', 'Out'].map((v) => <option key={v} value={v}>{v}</option>)}
        </TextField>

        {io === 'Out' && (
          <TextField
            label="Checked out to" select value={movie.who || ''}
            onChange={(e) => onChange('who', e.target.value)}
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
        <Button onClick={onSave} sx={sxStyles.saveBtn} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Single movie card ──────────────────────────────────────────────────────────
function SingleMovieCard({ movie, onEdit, onDelete }) {
  const io = ioLabel(movie.io), lost = lostLabel(movie.lost);
  return (
    <Card sx={sxStyles.card} elevation={3}>
      <CardMedia
        component="img" sx={sxStyles.media}
        image={movie.img_url || PLACEHOLDER} alt={movie.name}
        onError={(e) => { e.target.src = PLACEHOLDER; }}
      />
      <span style={sxStyles.badgeMedia}>
        <Chip size="small" label={movie.media1 || 'DVD'}
          style={{ backgroundColor: mediaColor(movie.media1), color: '#fff', fontSize: 10 }} />
      </span>
      <span style={sxStyles.badge}>
        <Chip size="small" label={lost === 'Yes' ? 'Lost' : io}
          color={io === 'In' && lost !== 'Yes' ? 'primary' : 'secondary'} />
      </span>
      <CardContent style={{ padding: '8px 10px', flexGrow: 1 }}>
        <Typography sx={sxStyles.cardTitle}>{movie.name}</Typography>
        <Typography sx={sxStyles.cardSub}>
          {movie.rated1} · {movie.yearR1} · {movie.length1}min
        </Typography>
        {io === 'Out' && (
          <Typography style={{ fontSize: '0.72rem', color: '#b71c1c' }}>{movie.who ? `Out: ${movie.who}` : 'Out'}</Typography>
        )}
      </CardContent>
      <CardActions style={{ padding: '0 4px 4px' }}>
        <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
      </CardActions>
    </Card>
  );
}

// ── Collection card (Double/Triple/Quad Feature, Box Set) — expandable ────────
function CollectionCard({ movie, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const slots = collectionSlots(movie);
  const io = ioLabel(movie.io), lost = lostLabel(movie.lost);

  return (
    <Card sx={sxStyles.card} elevation={3} style={{ width: 220, maxWidth: '100%' }}>
      <CardMedia
        component="img" sx={sxStyles.media}
        image={movie.img_url || PLACEHOLDER} alt={movie.name}
        onError={(e) => { e.target.src = PLACEHOLDER; }}
      />
      <span style={sxStyles.badgeMedia}>
        <Chip size="small" label={movie.featureMedia || 'Collection'}
          style={{ backgroundColor: '#6a1b9a', color: '#fff', fontSize: 10 }} />
      </span>
      <span style={sxStyles.badge}>
        <Chip size="small" label={lost === 'Yes' ? 'Lost' : io}
          color={io === 'In' && lost !== 'Yes' ? 'primary' : 'secondary'} />
      </span>
      <CardContent style={{ padding: '8px 10px', flexGrow: 1 }}>
        <Typography sx={sxStyles.cardTitle}>{movie.name}</Typography>
        <Typography sx={sxStyles.cardSub}>{slots.length} films</Typography>
        {io === 'Out' && (
          <Typography style={{ fontSize: '0.72rem', color: '#b71c1c' }}>{movie.who ? `Out: ${movie.who}` : 'Out'}</Typography>
        )}
      </CardContent>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px' }}>
        <Typography style={{ fontSize: '0.7rem', color: '#4a148c', cursor: 'pointer' }}
          onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Hide films' : 'Show films'}
        </Typography>
        <IconButton size="small" sx={sxStyles.expandBtn} onClick={() => setExpanded((e) => !e)}
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </div>
      <Collapse in={expanded}>
        <div style={{ padding: '4px 10px' }}>
          {slots.map((s) => (
            <div key={s.slot} style={sxStyles.slotRow}>
              <strong>{s.name}</strong> — {s.rated}, {s.year}, {s.media}
            </div>
          ))}
        </div>
      </Collapse>
      <CardActions style={{ padding: '0 4px 4px' }}>
        <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
      </CardActions>
    </Card>
  );
}

// ── Main page — two grids ──────────────────────────────────────────────────────
export default function MoviesPage() {
  const { state } = useAppContext();
  const { user } = state;
  const {
    movies, getMovies, addMovie, uploadMoviePoster,
    handleMovieChange, startEditingMovie, stopEditingMovie, deleteMovie,
  } = useMovies();
  const { contacts, getContacts } = useContacts();

  const [search,    setSearch]    = useState('');
  const [dialog,    setDialog]    = useState(null);
  const [newMovie,  setNewMovie]  = useState(null);
  const [editFile,  setEditFile]  = useState(null); // pending File object for the edit dialog
  const [newFile,   setNewFile]   = useState(null); // pending File object for the add dialog

  useEffect(() => { if (user.id) { getMovies(); getContacts(); } }, [user.id, getMovies, getContacts]);

  const contactNames = contacts.map((c) => `${c.firstName} ${c.lastName}`.trim());

  const filtered = movies.filter((m) =>
    (m.name || '').toLowerCase().includes(search.toLowerCase())
  );
  const singles     = filtered.filter((m) => !isCollection(m));
  const collections = filtered.filter((m) => isCollection(m));

  const openEdit = (i, movie) => {
    startEditingMovie(i);
    setEditFile(null);
    setDialog({ idx: i, movie: { ...movie, io: ioLabel(movie.io), lost: lostLabel(movie.lost) } });
  };

  const handleDialogChange = (field, value) => {
    setDialog((d) => ({ ...d, movie: { ...d.movie, [field]: value } }));
    handleMovieChange(field, value, dialog.idx);
  };

  const handleSave = async () => {
    // media_type comes from the primary slot's media field (e.g. 'DVD', 'Blu-Ray')
    const mediaType = dialog.movie.media1 || 'dvd';
    const imgUrl = await uploadMoviePoster(dialog.movie.name, mediaType, editFile, null);
    if (imgUrl) handleMovieChange('img_url', imgUrl, dialog.idx);
    await stopEditingMovie();
    setDialog(null);
    setEditFile(null);
  };

  const handleNewChange = (field, value) => setNewMovie((m) => ({ ...m, [field]: value }));
  const handleAddSave = async () => {
    const mediaType = newMovie.media1 || 'dvd';
    const imgUrl = await uploadMoviePoster(newMovie.name, mediaType, newFile, null);
    await addMovie({ ...newMovie, img_url: imgUrl || '' });
    setNewMovie(null);
    setNewFile(null);
  };

  // Find the real index in `movies` (not the filtered array) for edit/delete
  const realIndex = (movie) => movies.findIndex((m) => m === movie);

  return (
    <div style={sxStyles.root}>
      <div style={sxStyles.toolbar}>
        <Typography sx={sxStyles.title}>🎬 Movies</Typography>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search movies…"
          startAdornment={<InputAdornment position="start"><SearchIcon /></InputAdornment>}
          sx={{ flex: '1 1 200px', minWidth: 0 }}
        />
        <Button
          sx={sxStyles.addBtn} variant="contained" startIcon={<AddIcon />}
          onClick={() => setNewMovie({ ...emptyMovie(), io: 'In', lost: 'No' })}
        >
          Add Movie
        </Button>
      </div>

      {/* Grid 1 — single releases */}
      <div style={sxStyles.section}>
        <Typography sx={sxStyles.sectionTitle}>Movies ({singles.length})</Typography>
        <div style={sxStyles.grid}>
          {singles.map((movie) => {
            const i = realIndex(movie);
            return (
              <SingleMovieCard
                key={movie.id || i}
                movie={movie}
                onEdit={() => openEdit(i, movie)}
                onDelete={() => deleteMovie(i)}
              />
            );
          })}
        </div>
      </div>

      {/* Grid 2 — Double/Triple/Quadruple Feature & Box Sets */}
      {collections.length > 0 && (
        <div style={sxStyles.section}>
          <Typography sx={sxStyles.sectionTitle}>
            Multi-Feature &amp; Box Sets ({collections.length})
          </Typography>
          <div style={sxStyles.grid}>
            {collections.map((movie) => {
              const i = realIndex(movie);
              return (
                <CollectionCard
                  key={movie.id || i}
                  movie={movie}
                  onEdit={() => openEdit(i, movie)}
                  onDelete={() => deleteMovie(i)}
                />
              );
            })}
          </div>
        </div>
      )}

      <MovieDialog open={!!dialog}   movie={dialog?.movie} onClose={() => setDialog(null)}   onChange={handleDialogChange} onSave={handleSave}   onFileSelect={setEditFile} contactNames={contactNames} />
      <MovieDialog open={!!newMovie} movie={newMovie}       onClose={() => setNewMovie(null)} onChange={handleNewChange}    onSave={handleAddSave} onFileSelect={setNewFile}  contactNames={contactNames} />
    </div>
  );
}
