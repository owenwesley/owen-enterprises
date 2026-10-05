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
import { useMovies, isCollection, filmCount, collectionSlots, removeFilm, emptyMovie, outSummary, ioLabel } from './hooks/useMovies';
import { useContacts } from './hooks/useContacts';
import { FitDialog, FitContent, FieldGrid, Full, ImagePick } from '../../components/DialogFit';

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

// ── Lost conversion: DB stores 1/0, UI shows Yes/No (ioLabel / outSummary come from the hook) ──
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
function MovieDialog({ open, movie, onClose, onChange, onSave, onFileSelect, onFilmFile, contactNames }) {
  const [slotTab, setSlotTab] = useState(0);
  const [whoErr, setWhoErr] = useState(false);
  if (!movie) return null;

  const slotCount = requiredSlotCount(movie.featureMedia, movie.numMovie);
  const isSet = slotCount > 1;
  const io   = ioLabel(movie.io);
  const lost = lostLabel(movie.lost);
  const t = slotTab + 1; // active film number (sets)

  // Clamp the active tab if a feature-type change shrinks the slot count
  // below the tab currently being viewed (e.g. Box Set 8 → Double Feature).
  if (slotTab >= slotCount) {
    setSlotTab(0);
  }

  /**
   * When the feature type changes, immediately recompute and store the
   * correct numMovie so the dialog and the saved row always agree.
   * Single <-> set also moves the disc's own status to / from film 1.
   */
  const handleFeatureTypeChange = (value) => {
    const nextCount = requiredSlotCount(value, movie.numMovie);
    onChange('featureMedia', value);
    onChange('numMovie', nextCount);
    if (slotCount === 1 && nextCount > 1) {          // single -> set
      onChange('io1', movie.io);
      onChange('who1', movie.who);
    } else if (slotCount > 1 && nextCount === 1) {   // set -> single
      onChange('io', movie.io1);
      onChange('who', movie.who1);
    }
    setWhoErr(false);
  };

  // Single: Out starts with nobody chosen, In always means "In Library".
  const handleStatusChange = (value) => {
    onChange('io', value);
    onChange('who', value === 'Out' ? '' : 'In Library');
    setWhoErr(false);
  };

  // Set: one film at a time, or the whole set at once.
  const setFilmStatus = (n, value) => {
    onChange(`io${n}`, value);
    onChange(`who${n}`, value === 'Out' ? '' : 'In Library');
    setWhoErr(false);
  };
  const setAll = (value, who) => {
    for (let n = 1; n <= slotCount; n++) {
      onChange(`io${n}`, value);
      onChange(`who${n}`, value === 'Out' ? who : 'In Library');
    }
    setWhoErr(false);
  };

  const whoValue = contactNames.includes(movie.who) ? movie.who : '';
  const filmWho  = (n) => (contactNames.includes(movie[`who${n}`]) ? movie[`who${n}`] : '');
  const trySave = () => {
    if (!isSet) {
      if (io === 'Out' && !whoValue) { setWhoErr(true); return; }
    } else {
      for (let n = 1; n <= slotCount; n++) {
        if (ioLabel(movie[`io${n}`]) === 'Out' && !filmWho(n)) {
          setSlotTab(n - 1); setWhoErr(true); return;
        }
      }
    }
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
        fullWidth size="small"
      />
    );
  };
  const sel = (label, key, opts, onSlot = null) => {
    const target = onSlot || key;
    return (
      <TextField
        key={target} label={label} select value={movie[target] || opts[0]}
        onChange={(e) => onChange(target, e.target.value)}
        fullWidth size="small" SelectProps={{ native: true }}
      >
        {opts.map((v) => <option key={v} value={v}>{v}</option>)}
      </TextField>
    );
  };
  const borrowerSelect = (label, value, onPick, error, helper) => (
    <TextField
      label={label} select value={value} onChange={(e) => onPick(e.target.value)}
      error={error} helperText={error ? helper : ''}
      fullWidth size="small" SelectProps={{ native: true }}
    >
      <option value="" disabled></option>
      {contactNames.map((name) => <option key={name} value={name}>{name}</option>)}
    </TextField>
  );
  const lostField = (
    <TextField
      label="Lost?" select value={lost}
      onChange={(e) => onChange('lost', e.target.value)}
      fullWidth size="small" SelectProps={{ native: true }}
    >
      {['No', 'Yes'].map((v) => <option key={v} value={v}>{v}</option>)}
    </TextField>
  );

  return (
    <FitDialog open={open} onClose={onClose} maxWidth="sm">
      <DialogTitle>{movie.id ? 'Edit Movie' : 'Add Movie'}</DialogTitle>
      <FitContent>
        <FieldGrid>
          {/* Feature type — selecting this immediately fixes the slot count per the rule table */}
          <Full>{field('Title', 'name')}</Full>
          <TextField
            label="Feature Type" select value={movie.featureMedia || ''}
            onChange={(e) => handleFeatureTypeChange(e.target.value)}
            fullWidth size="small" SelectProps={{ native: true }}
          >
            <option value="">Single</option>
            {FEATURE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
          </TextField>

          {/* Box Set only: ask the user how many films (5–12), used verbatim as the slot count */}
          {movie.featureMedia === 'Box Set' && (
            <TextField
              label={`Films (${BOXSET_MIN}–${BOXSET_MAX})`} type="number"
              value={movie.numMovie || BOXSET_MIN}
              inputProps={{ min: BOXSET_MIN, max: BOXSET_MAX }}
              onChange={(e) => handleBoxSetCountChange(e.target.value)}
              fullWidth size="small"
            />
          )}

          {isSet ? (
            <>
              {lostField}
              <Full>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button size="small" variant="outlined" onClick={() => setAll('In', '')}>All films In</Button>
                  <TextField
                    select value="" size="small" SelectProps={{ native: true, displayEmpty: true }}
                    onChange={(e) => e.target.value && setAll('Out', e.target.value)}
                    sx={{ flex: '1 1 160px' }}
                  >
                    <option value="">Lend whole set to…</option>
                    {contactNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </TextField>
                </div>
              </Full>
              <Full>
                <Tabs value={slotTab} onChange={(e, v) => setSlotTab(v)} variant="scrollable" scrollButtons="auto"
                  sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0 } }}>
                  {Array.from({ length: slotCount }, (_, i) => (
                    <Tab key={i} label={`Film ${i + 1}`} />
                  ))}
                </Tabs>
              </Full>
              <Full>{field('Title', 'name', 'text', `name${t}`)}</Full>
              {sel('Rating',     'rated',  RATINGS,  `rated${t}`)}
              {field('Length (min)', 'length', 'number', `length${t}`)}
              {field('Year',     'yearR',  'number', `yearR${t}`)}
              {sel('Media',      'media',  MEDIA_TYPES, `media${t}`)}
              <TextField
                label="Status" select value={ioLabel(movie[`io${t}`])}
                onChange={(e) => setFilmStatus(t, e.target.value)}
                fullWidth size="small" SelectProps={{ native: true }}
              >
                {['In', 'Out'].map((v) => <option key={v} value={v}>{v}</option>)}
              </TextField>
              {ioLabel(movie[`io${t}`]) === 'Out' &&
                borrowerSelect('Checked out to', filmWho(t), (v) => { onChange(`who${t}`, v); setWhoErr(false); }, whoErr, `Choose who has film ${t}.`)}
              <Full>
                <ImagePick
                  inputKey={`film-file-${t}`} label={`Picture for film ${t}`}
                  src={movie[`img${t}`]} onFile={(file) => onFilmFile && onFilmFile(t, file)}
                />
              </Full>
              <Full>
                <ImagePick label="Set cover image" src={movie.img_url} onFile={onFileSelect} />
              </Full>
            </>
          ) : (
            <>
              {sel('Media', 'media1', MEDIA_TYPES)}
              {sel('Rating', 'rated1', RATINGS)}
              {field('Length (min)', 'length1', 'number')}
              {field('Year', 'yearR1', 'number')}
              {lostField}
              <TextField
                label="Status" select value={io}
                onChange={(e) => handleStatusChange(e.target.value)}
                fullWidth size="small" SelectProps={{ native: true }}
              >
                {['In', 'Out'].map((v) => <option key={v} value={v}>{v}</option>)}
              </TextField>
              {io === 'Out' &&
                borrowerSelect('Checked out to', whoValue, (v) => { onChange('who', v); setWhoErr(false); }, whoErr, 'Choose who has this movie.')}
              <Full>
                <ImagePick label="Poster Image" src={movie.img_url} onFile={onFileSelect} />
              </Full>
            </>
          )}
        </FieldGrid>
      </FitContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={trySave} sx={sxStyles.saveBtn} variant="contained">Save</Button>
      </DialogActions>
    </FitDialog>
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
        {outSummary(movie) && (
          <Typography style={{ fontSize: '0.72rem', color: '#b71c1c' }}>{outSummary(movie)}</Typography>
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
    <Card sx={sxStyles.card} elevation={3}>
      <div onClick={onOpen} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <CardMedia
          component="img" sx={sxStyles.media}
          image={movie.img_url || PLACEHOLDER} alt={movie.name}
          onError={(e) => { e.target.src = PLACEHOLDER; }}
        />
        <CardContent style={{ padding: '8px 10px', flexGrow: 1 }}>
          <Typography sx={sxStyles.cardTitle}>{movie.name}</Typography>
          <Typography sx={sxStyles.cardSub}>{filmCount(movie)} films · tap to open</Typography>
          {outSummary(movie) && (
            <Typography style={{ fontSize: '0.72rem', color: '#b71c1c' }}>{outSummary(movie)}</Typography>
          )}
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

// ── Films grid: every film on one disc/set, each with its own picture and status ─
function FilmsDialog({ movie, onClose, onEditFilm, onDeleteFilm }) {
  if (!movie) return null;
  const slots = collectionSlots(movie);
  return (
    <FitDialog open onClose={onClose} maxWidth="md">
      <DialogTitle>{movie.name} — {slots.length} films</DialogTitle>
      <FitContent>
        <div style={sxStyles.grid}>
          {slots.map((s) => (
            <Card key={s.slot} elevation={2} sx={{ ...sxStyles.card, maxWidth: 170 }}>
              <CardMedia
                component="img" sx={{ ...sxStyles.media, height: 170 }}
                image={s.img || movie.img_url || PLACEHOLDER} alt={s.name}
                onError={(e) => { e.target.src = PLACEHOLDER; }}
              />
              <span style={sxStyles.badgeMedia}>
                <Chip size="small" label={s.media}
                  style={{ backgroundColor: mediaColor(s.media), color: '#fff', fontSize: 10 }} />
              </span>
              <span style={sxStyles.badge}>
                <Chip size="small" label={s.io} color={s.io === 'In' ? 'primary' : 'secondary'} />
              </span>
              <CardContent style={{ padding: '8px 10px', flexGrow: 1 }}>
                <Typography sx={sxStyles.cardSub}>Film {s.slot}</Typography>
                <Typography sx={sxStyles.cardTitle}>{s.name || '(untitled)'}</Typography>
                <Typography sx={sxStyles.cardSub}>{s.rated} · {s.year || '—'} · {s.len || 0} min</Typography>
                {s.io === 'Out' && (
                  <Typography style={{ fontSize: '0.72rem', color: '#b71c1c' }}>
                    {s.who && s.who !== 'In Library' ? `Out: ${s.who}` : 'Out'}
                  </Typography>
                )}
              </CardContent>
              <CardActions style={{ padding: '0 4px 4px' }}>
                <IconButton size="small" onClick={() => onEditFilm(s.slot)}><EditIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => onDeleteFilm(s.slot)}><DeleteIcon fontSize="small" /></IconButton>
              </CardActions>
            </Card>
          ))}
        </div>
      </FitContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </FitDialog>
  );
}

// ── One film's details: title, rating, length, year, media, status, picture ──
function FilmEditDialog({ film, onClose, onSave, contactNames }) {
  const [f, setF] = useState(film);
  const [file, setFile] = useState(null);
  const [whoErr, setWhoErr] = useState(false);
  if (!film) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const whoValue = contactNames.includes(f.who) ? f.who : '';
  const trySave = () => {
    if (f.io === 'Out' && !whoValue) { setWhoErr(true); return; }
    onSave(f, file);
  };
  return (
    <FitDialog open onClose={onClose} maxWidth="xs">
      <DialogTitle>Edit Film {f.slot}</DialogTitle>
      <FitContent>
        <FieldGrid>
          <Full>
            <TextField label="Title" value={f.name} onChange={(e) => set('name', e.target.value)}
              fullWidth size="small" />
          </Full>
          <TextField label="Rating" select value={f.rated} onChange={(e) => set('rated', e.target.value)}
            fullWidth size="small" SelectProps={{ native: true }}>
            {RATINGS.map((v) => <option key={v} value={v}>{v}</option>)}
          </TextField>
          <TextField label="Length (min)" type="number" value={f.len} onChange={(e) => set('len', e.target.value)}
            fullWidth size="small" />
          <TextField label="Year" type="number" value={f.year} onChange={(e) => set('year', e.target.value)}
            fullWidth size="small" />
          <TextField label="Media" select value={f.media} onChange={(e) => set('media', e.target.value)}
            fullWidth size="small" SelectProps={{ native: true }}>
            {MEDIA_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
          </TextField>
          <TextField label="Status" select value={f.io}
            onChange={(e) => { setF((x) => ({ ...x, io: e.target.value, who: e.target.value === 'Out' ? '' : 'In Library' })); setWhoErr(false); }}
            fullWidth size="small" SelectProps={{ native: true }}>
            {['In', 'Out'].map((v) => <option key={v} value={v}>{v}</option>)}
          </TextField>
          {f.io === 'Out' && (
            <TextField label="Checked out to" select value={whoValue}
              onChange={(e) => { set('who', e.target.value); setWhoErr(false); }}
              error={whoErr} helperText={whoErr ? 'Choose who has this film.' : ''}
              fullWidth size="small" SelectProps={{ native: true }}>
              <option value="" disabled></option>
              {contactNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </TextField>
          )}
          <Full>
            <ImagePick label="Picture" src={f.img} onFile={setFile} />
          </Full>
        </FieldGrid>
      </FitContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={trySave} sx={sxStyles.saveBtn} variant="contained">Save</Button>
      </DialogActions>
    </FitDialog>
  );
}

// ── Main page — one A–Z grid (singles and sets together, as the server sorts them) ─
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
  const [editFile,  setEditFile]  = useState(null); // pending set/poster File for the edit dialog
  const [newFile,   setNewFile]   = useState(null); // pending set/poster File for the add dialog
  const [editFilmFiles, setEditFilmFiles] = useState({}); // { slot: File } pending film pictures, edit dialog
  const [newFilmFiles,  setNewFilmFiles]  = useState({}); // same, add dialog
  const [filmsId,   setFilmsId]   = useState(null); // id of the collection whose films grid is open
  const [filmEdit,  setFilmEdit]  = useState(null); // film being edited in the films grid

  useEffect(() => { if (user.id) { getMovies(); getContacts(); } }, [user.id, getMovies, getContacts]);

  const contactNames = contacts.map((c) => `${c.firstName} ${c.lastName}`.trim());

  // The server already returns movies ORDER BY name, id (exactly as typed:
  // "The Matrix" sorts under T). Filtering keeps that order.
  // Search matches the disc name OR any film title inside a set.
  const q = search.toLowerCase();
  const filtered = movies.filter((m) =>
    (m.name || '').toLowerCase().includes(q) ||
    (isCollection(m) && collectionSlots(m).some((f) => f.name.toLowerCase().includes(q)))
  );

  // Deleting a whole movie or set cannot be undone: ask first.
  const confirmDelete = (movie, i) => {
    const what = isCollection(movie) ? `the set \"${movie.name}\" and all its films` : `\"${movie.name}\"`;
    if (window.confirm(`Delete ${what}?`)) deleteMovie(i);
  };

  const openEdit = (movie) => {
    const row = { ...movie, io: ioLabel(movie.io), lost: lostLabel(movie.lost) };
    for (let i = 1; i <= 12; i++) row[`io${i}`] = ioLabel(movie[`io${i}`] ?? 1);
    setEditFile(null);
    setEditFilmFiles({});
    setDialog({ movie: row });
  };

  // The dialog holds the whole edited row, so save that row directly.
  const handleDialogChange = (field, value) => {
    setDialog((d) => ({ ...d, movie: { ...d.movie, [field]: value } }));
  };

  // Uploads each pending film picture and returns the row with img1..N filled in.
  const withFilmPictures = async (m, files) => {
    const out = { ...m };
    for (const [slot, file] of Object.entries(files)) {
      if (Number(slot) > filmCount(m)) continue;
      const label = m[`name${slot}`] || `film ${slot}`;
      const url = await uploadMoviePoster(`${m.name} ${label}`, m[`media${slot}`] || 'dvd', file, null);
      if (url) out[`img${slot}`] = url;
    }
    return out;
  };

  const handleSave = async () => {
    let m = dialog.movie;
    // Only upload when a new file was chosen or the movie has no picture yet:
    // an upload with no file overwrites the stored picture with the placeholder.
    const imgUrl = (editFile || !m.img_url)
      ? await uploadMoviePoster(m.name, m.media1 || 'dvd', editFile, null)
      : null;
    m = await withFilmPictures(m, editFilmFiles);
    const err = await saveMovie({ ...m, img_url: imgUrl || m.img_url });
    if (err) return; // server message is already shown; keep the dialog open
    setDialog(null);
    setEditFile(null);
    setEditFilmFiles({});
  };

  const handleNewChange = (field, value) => setNewMovie((m) => ({ ...m, [field]: value }));
  const handleAddSave = async () => {
    const mediaType = newMovie.media1 || 'dvd';
    const imgUrl = await uploadMoviePoster(newMovie.name, mediaType, newFile, null);
    const m = await withFilmPictures(newMovie, newFilmFiles);
    const err = await addMovie({ ...m, img_url: imgUrl || '' });
    if (err) return; // keep the dialog open so nothing typed is lost
    setNewMovie(null);
    setNewFile(null);
    setNewFilmFiles({});
  };

  // Find the real index in `movies` (not the filtered array) for delete
  const realIndex = (movie) => movies.findIndex((m) => m === movie);

  const filmsMovie = movies.find((m) => m.id === filmsId) || null;
  const totalFilms = movies.reduce((n, m) => n + filmCount(m), 0);

  const saveFilm = async (f, file) => {
    const m = { ...filmsMovie };
    m[`name${f.slot}`]   = f.name;
    m[`rated${f.slot}`]  = f.rated;
    m[`length${f.slot}`] = Number(f.len) || 0;
    m[`yearR${f.slot}`]  = Number(f.year) || 0;
    m[`media${f.slot}`]  = f.media;
    m[`io${f.slot}`]     = f.io;
    m[`who${f.slot}`]    = f.io === 'Out' ? f.who : 'In Library';
    m[`img${f.slot}`]    = f.img;
    if (file) {
      const url = await uploadMoviePoster(`${m.name} ${f.name || `film ${f.slot}`}`, f.media || 'dvd', file, null);
      if (url) m[`img${f.slot}`] = url;
    }
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
          onClick={() => { setNewFile(null); setNewFilmFiles({}); setNewMovie({ ...emptyMovie(), io: 'In', lost: 'No' }); }}
        >
          Add Movie
        </Button>
      </div>

      {/* One grid: singles and Double/Triple/Quadruple/Box Set cards together, A–Z */}
      <div style={sxStyles.section}>
        <Typography sx={sxStyles.sectionTitle}>Movies ({totalFilms})</Typography>
        <div style={sxStyles.grid}>
          {filtered.map((movie) => {
            const i = realIndex(movie);
            return isCollection(movie) ? (
              <CollectionCard
                key={movie.id || i}
                movie={movie}
                onOpen={() => setFilmsId(movie.id)}
                onEdit={() => openEdit(movie)}
                onDelete={() => confirmDelete(movie, i)}
              />
            ) : (
              <SingleMovieCard
                key={movie.id || i}
                movie={movie}
                onEdit={() => openEdit(movie)}
                onDelete={() => confirmDelete(movie, i)}
              />
            );
          })}
        </div>
      </div>

      <FilmsDialog
        movie={filmsMovie} onClose={() => setFilmsId(null)}
        onEditFilm={(slot) => setFilmEdit(collectionSlots(filmsMovie).find((x) => x.slot === slot))}
        onDeleteFilm={deleteFilm}
      />
      <FilmEditDialog
        key={filmEdit ? `${filmsId}-${filmEdit.slot}` : 'none'}
        film={filmEdit} onClose={() => setFilmEdit(null)} onSave={saveFilm} contactNames={contactNames}
      />
      <MovieDialog open={!!dialog}   movie={dialog?.movie} onClose={() => setDialog(null)}   onChange={handleDialogChange} onSave={handleSave}   onFileSelect={setEditFile} onFilmFile={(n, f) => setEditFilmFiles((x) => ({ ...x, [n]: f }))} contactNames={contactNames} />
      <MovieDialog open={!!newMovie} movie={newMovie}       onClose={() => setNewMovie(null)} onChange={handleNewChange}    onSave={handleAddSave} onFileSelect={setNewFile}  onFilmFile={(n, f) => setNewFilmFiles((x) => ({ ...x, [n]: f }))} contactNames={contactNames} />
    </div>
  );
}
