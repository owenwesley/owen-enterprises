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
import { useMovies, isCollection, filmCount, collectionSlots, removeFilm, emptyMovie } from './hooks/useMovies';
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

// "Out: Wes Owen". Old rows saved before this fix may hold "In Library" as the
// borrower; show plain "Out" for those rather than "Out: In Library".
const outText = (m) => (m.who && m.who !== 'In Library' ? `Out: ${m.who}` : 'Out');

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
  const [whoErr, setWhoErr] = useState(false);
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

  // Status change: Out starts with nobody chosen, In always means "In Library".
  const handleStatusChange = (value) => {
    onChange('io', value);
    onChange('who', value === 'Out' ? '' : 'In Library');
    setWhoErr(false);
  };

  const whoValue = contactNames.includes(movie.who) ? movie.who : '';
  const trySave = () => {
    if (io === 'Out' && !whoValue) { setWhoErr(true); return; }
    setWhoErr(false);
    onSave();
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
          onChange={(e) => handleStatusChange(e.target.value)}
          fullWidth size="small" SelectProps={{ native: true }} sx={sxStyles.field}
        >
          {['In', 'Out'].map((v) => <option key={v} value={v}>{v}</option>)}
        </TextField>

        {io === 'Out' && (
          <TextField
            label="Checked out to" select value={whoValue}
            onChange={(e) => { onChange('who', e.target.value); setWhoErr(false); }}
            error={whoErr} helperText={whoErr ? 'Choose who has this movie.' : ''}
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
          <Typography style={{ fontSize: '0.72rem', color: '#b71c1c' }}>{outText(movie)}</Typography>
        )}
      </CardContent>
      <CardActions style={{ padding: '0 4px 4px' }}>
        <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
      </CardActions>
    </Card>
  );
}

// ── Collection card (Double/Triple/Quad Feature, Box Set) — click to open films ─
function CollectionCard({ movie, onOpen, onEdit, onDelete }) {
  const io = ioLabel(movie.io), lost = lostLabel(movie.lost);

  return (
    <Card sx={sxStyles.card} elevation={3} style={{ width: 220, maxWidth: '100%' }}>
      <div onClick={onOpen} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <CardMedia
          component="img" sx={sxStyles.media}
          image={movie.img_url || PLACEHOLDER} alt={movie.name}
          onError={(e) => { e.target.src = PLACEHOLDER; }}
        />
        <CardContent style={{ padding: '8px 10px', flexGrow: 1 }}>
          <Typography sx={sxStyles.cardTitle}>{movie.name}</Typography>
          <Typography sx={sxStyles.cardSub}>{filmCount(movie)} films</Typography>
          {io === 'Out' && (
            <Typography style={{ fontSize: '0.72rem', color: '#b71c1c' }}>{outText(movie)}</Typography>
          )}
          <Typography style={{ fontSize: '0.7rem', color: '#4a148c' }}>Tap to see films</Typography>
        </CardContent>
      </div>
      <span style={sxStyles.badgeMedia}>
        <Chip size="small" label={movie.featureMedia || 'Collection'}
          style={{ backgroundColor: '#6a1b9a', color: '#fff', fontSize: 10 }} />
      </span>
      <span style={sxStyles.badge}>
        <Chip size="small" label={lost === 'Yes' ? 'Lost' : io}
          color={io === 'In' && lost !== 'Yes' ? 'primary' : 'secondary'} />
      </span>
      <CardActions style={{ padding: '0 4px 4px' }}>
        <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
      </CardActions>
    </Card>
  );
}

// ── Films grid: every film on one disc/set, each editable or removable ────────
function FilmsDialog({ movie, onClose, onEditFilm, onDeleteFilm }) {
  if (!movie) return null;
  const slots = collectionSlots(movie);
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{movie.name} — {slots.length} films</DialogTitle>
      <DialogContent>
        <div style={sxStyles.grid}>
          {slots.map((s) => (
            <Card key={s.slot} elevation={2} style={{ width: 170, maxWidth: '100%' }}>
              <CardContent style={{ padding: '8px 10px' }}>
                <Typography sx={sxStyles.cardSub}>Film {s.slot}</Typography>
                <Typography sx={sxStyles.cardTitle}>{s.name || '(untitled)'}</Typography>
                <Typography sx={sxStyles.cardSub}>{s.rated} · {s.year || '—'} · {s.len || 0} min</Typography>
                <Chip size="small" label={s.media}
                  style={{ backgroundColor: mediaColor(s.media), color: '#fff', fontSize: 10, marginTop: 4 }} />
              </CardContent>
              <CardActions style={{ padding: '0 4px 4px' }}>
                <IconButton size="small" onClick={() => onEditFilm(s.slot)}><EditIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => onDeleteFilm(s.slot)}><DeleteIcon fontSize="small" /></IconButton>
              </CardActions>
            </Card>
          ))}
        </div>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

// ── One film's details (title, rating, length, year, media) ──────────────────
function FilmEditDialog({ film, onClose, onSave }) {
  const [f, setF] = useState(film);
  if (!film) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit Film {f.slot}</DialogTitle>
      <DialogContent>
        <TextField label="Title" value={f.name} onChange={(e) => set('name', e.target.value)}
          fullWidth size="small" sx={sxStyles.field} />
        <TextField label="Rating" select value={f.rated} onChange={(e) => set('rated', e.target.value)}
          fullWidth size="small" SelectProps={{ native: true }} sx={sxStyles.field}>
          {RATINGS.map((v) => <option key={v} value={v}>{v}</option>)}
        </TextField>
        <TextField label="Length (min)" type="number" value={f.len} onChange={(e) => set('len', e.target.value)}
          fullWidth size="small" sx={sxStyles.field} />
        <TextField label="Year" type="number" value={f.year} onChange={(e) => set('year', e.target.value)}
          fullWidth size="small" sx={sxStyles.field} />
        <TextField label="Media" select value={f.media} onChange={(e) => set('media', e.target.value)}
          fullWidth size="small" SelectProps={{ native: true }} sx={sxStyles.field}>
          {MEDIA_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(f)} sx={sxStyles.saveBtn} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main page — two grids ──────────────────────────────────────────────────────
export default function MoviesPage() {
  const { state } = useAppContext();
  const { user } = state;
  const {
    movies, getMovies, addMovie, saveMovie, uploadMoviePoster, deleteMovie,
  } = useMovies();
  const { contacts, getContacts } = useContacts();

  const [search,    setSearch]    = useState('');
  const [dialog,    setDialog]    = useState(null);
  const [newMovie,  setNewMovie]  = useState(null);
  const [editFile,  setEditFile]  = useState(null); // pending File object for the edit dialog
  const [newFile,   setNewFile]   = useState(null); // pending File object for the add dialog
  const [filmsId,   setFilmsId]   = useState(null); // id of the collection whose films grid is open
  const [filmEdit,  setFilmEdit]  = useState(null); // film slot being edited in the films grid

  useEffect(() => { if (user.id) { getMovies(); getContacts(); } }, [user.id, getMovies, getContacts]);

  const contactNames = contacts.map((c) => `${c.firstName} ${c.lastName}`.trim());

  const filtered = movies.filter((m) =>
    (m.name || '').toLowerCase().includes(search.toLowerCase())
  );
  const singles     = filtered.filter((m) => !isCollection(m));
  const collections = filtered.filter((m) => isCollection(m));

  const openEdit = (movie) => {
    setEditFile(null);
    setDialog({ movie: { ...movie, io: ioLabel(movie.io), lost: lostLabel(movie.lost) } });
  };

  // The dialog holds the whole edited row, so save that row directly.
  const handleDialogChange = (field, value) => {
    setDialog((d) => ({ ...d, movie: { ...d.movie, [field]: value } }));
  };

  const handleSave = async () => {
    const m = dialog.movie;
    const imgUrl = await uploadMoviePoster(m.name, m.media1 || 'dvd', editFile, null);
    const err = await saveMovie({ ...m, img_url: imgUrl || m.img_url });
    if (err) return; // server message is already shown; keep the dialog open
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

  // Find the real index in `movies` (not the filtered array) for delete
  const realIndex = (movie) => movies.findIndex((m) => m === movie);

  const filmsMovie = movies.find((m) => m.id === filmsId) || null;
  const totalFilms = movies.reduce((n, m) => n + filmCount(m), 0);
  const collectionFilms = collections.reduce((n, m) => n + filmCount(m), 0);

  const saveFilm = async (f) => {
    const m = { ...filmsMovie };
    m[`name${f.slot}`] = f.name;
    m[`rated${f.slot}`] = f.rated;
    m[`length${f.slot}`] = Number(f.len) || 0;
    m[`yearR${f.slot}`] = Number(f.year) || 0;
    m[`media${f.slot}`] = f.media;
    const err = await saveMovie(m);
    if (!err) setFilmEdit(null);
  };

  const deleteFilm = async (slot) => {
    const name = filmsMovie[`name${slot}`] || `Film ${slot}`;
    if (!window.confirm(`Remove "${name}" from this set?`)) return;
    const next = removeFilm(filmsMovie, slot);
    const err = await saveMovie(next);
    if (!err && filmCount(next) === 1) setFilmsId(null); // no longer a collection
  };

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
        <Typography sx={sxStyles.cardSub}>Total films: {totalFilms}</Typography>
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
                onEdit={() => openEdit(movie)}
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
            Multi-Feature &amp; Box Sets ({collections.length} sets · {collectionFilms} films)
          </Typography>
          <div style={sxStyles.grid}>
            {collections.map((movie) => {
              const i = realIndex(movie);
              return (
                <CollectionCard
                  key={movie.id || i}
                  movie={movie}
                  onOpen={() => setFilmsId(movie.id)}
                  onEdit={() => openEdit(movie)}
                  onDelete={() => deleteMovie(i)}
                />
              );
            })}
          </div>
        </div>
      )}

      <FilmsDialog
        movie={filmsMovie} onClose={() => setFilmsId(null)}
        onEditFilm={(slot) => setFilmEdit(collectionSlots(filmsMovie).find((x) => x.slot === slot))}
        onDeleteFilm={deleteFilm}
      />
      <FilmEditDialog key={filmEdit?.slot ?? 'none'} film={filmEdit} onClose={() => setFilmEdit(null)} onSave={saveFilm} />
      <MovieDialog open={!!dialog}   movie={dialog?.movie} onClose={() => setDialog(null)}   onChange={handleDialogChange} onSave={handleSave}   onFileSelect={setEditFile} contactNames={contactNames} />
      <MovieDialog open={!!newMovie} movie={newMovie}       onClose={() => setNewMovie(null)} onChange={handleNewChange}    onSave={handleAddSave} onFileSelect={setNewFile}  contactNames={contactNames} />
    </div>
  );
}
