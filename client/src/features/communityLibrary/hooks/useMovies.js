import { useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch, postFormData } from '../../../utils/api';

/** Number of films on a disc/set (1-12), from the stored numMovie. */
export function filmCount(movie) {
  return Math.min(Math.max(parseInt(movie.numMovie, 10) || 1, 1), 12);
}

/** True when the row holds more than one film (Double, Triple, Quad, Box Set). */
export function isCollection(movie) {
  return filmCount(movie) > 1 || !!movie.featureMedia;
}

/** Feature type label for a film count: 1 = '' (single), 2-4 named, 5+ Box Set. */
export function featureTypeFor(n) {
  return ({ 1: '', 2: 'Double Feature', 3: 'Triple Feature', 4: 'Quadruple Feature' })[n] ?? 'Box Set';
}

/** DB 1/0 or 'In'/'Out' -> 'In' | 'Out'. */
export const ioLabel = (v) => (v === 1 || v === '1' || v === 'In' ? 'In' : 'Out');

/** All film slots 1..numMovie for a movie row, in order (empty titles included). */
export function collectionSlots(movie) {
  const slots = [];
  const count = filmCount(movie);
  for (let i = 1; i <= count; i++) {
    slots.push({
      slot:  i,
      name:  movie[`name${i}`] || '',
      rated: movie[`rated${i}`]  || 'NR',
      len:   movie[`length${i}`] || 0,
      year:  movie[`yearR${i}`]  || 0,
      media: movie[`media${i}`]  || 'DVD',
      io:    ioLabel(movie[`io${i}`] ?? 1),
      who:   movie[`who${i}`] || '',
      img:   movie[`img${i}`] || '',
    });
  }
  return slots;
}

/**
 * Short "who has it" text for a card. Single: "Out: Wes Owen". Set: "Out: Wes
 * Owen" when every film is out with one person, "2 of 3 out" otherwise.
 * Returns '' when nothing is out. Rows saved before the borrower fix may hold
 * "In Library" as the borrower; those read plain "Out".
 */
export function outSummary(movie) {
  const name = (w) => (w && w !== 'In Library' ? `Out: ${w}` : 'Out');
  if (filmCount(movie) === 1) {
    return ioLabel(movie.io) === 'Out' ? name(movie.who) : '';
  }
  const out = collectionSlots(movie).filter((s) => s.io === 'Out');
  if (!out.length) return '';
  const total = filmCount(movie);
  const who = [...new Set(out.map((s) => s.who))];
  if (out.length === total) return who.length === 1 ? name(who[0]) : `All ${total} out`;
  return who.length === 1 && who[0] && who[0] !== 'In Library'
    ? `${out.length} of ${total} out: ${who[0]}` : `${out.length} of ${total} out`;
}

/** Copies one film's fields from slot `from` to slot `to` ('' / defaults when from > 12). */
function copySlot(src, out, from, to) {
  const ok = from <= 12;
  out[`name${to}`]   = ok ? src[`name${from}`]   : '';
  out[`rated${to}`]  = ok ? src[`rated${from}`]  : 'NR';
  out[`length${to}`] = ok ? src[`length${from}`] : 0;
  out[`yearR${to}`]  = ok ? src[`yearR${from}`]  : 0;
  out[`media${to}`]  = ok ? src[`media${from}`]  : 'DVD';
  out[`io${to}`]     = ok ? src[`io${from}`]     : 1;
  out[`who${to}`]    = ok ? src[`who${from}`]    : 'In Library';
  out[`img${to}`]    = ok ? src[`img${from}`]    : '';
}

/** Returns a copy of the movie with film `slot` removed and later films shifted up. */
export function removeFilm(movie, slot) {
  const n = filmCount(movie);
  const out = { ...movie };
  for (let i = slot; i <= 12; i++) copySlot(movie, out, i + 1, i);
  out.numMovie = Math.max(n - 1, 1);
  out.featureMedia = featureTypeFor(out.numMovie);
  // A set that drops to one film becomes a single: its status lives on the disc.
  if (out.numMovie === 1) {
    out.io = out.io1;
    out.who = out.who1;
    out.img_url = out.img1 || out.img_url;
  }
  return out;
}

/** Empty 12-slot movie record ready for the add form / API call */
export function emptyMovie() {
  const row = {
    name: '', featureMedia: '', numMovie: 1,
    io: 'In', who: '', lost: 'No', img_url: '',
  };
  for (let i = 1; i <= 12; i++) {
    row[`name${i}`]   = '';
    row[`rated${i}`]  = 'NR';
    row[`length${i}`] = 0;
    row[`yearR${i}`]  = 0;
    row[`media${i}`]  = 'DVD';
    row[`io${i}`]     = 'In';
    row[`who${i}`]    = '';
    row[`img${i}`]    = '';
  }
  return row;
}

export function useMovies() {
  const { state, dispatch } = useAppContext();
  const { movies, user } = state;

  const getMovies = useCallback(async () => {
    if (!user.id) return;
    const data = await getFetch(`/communitylibrary/movies/${user.id}`);
    dispatch({ type: 'SET_MOVIES', payload: data?.results || [] });
  }, [user.id, dispatch]);

  /**
   * Uploads a movie poster (or triggers the server's placeholder fallback
   * if `file` is null) and returns the resulting img_url.
   */
  const uploadMoviePoster = useCallback(async (name, mediaType, file, theme) => {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('media_type', mediaType || 'dvd');
    if (theme) formData.append('theme', theme);
    if (file)  formData.append('image', file);
    const data = await postFormData('/communitylibrary/upload/movie', formData);
    return data?.img_url || null;
  }, []);

  /** Adds a movie. Returns an error string or null. */
  const addMovie = useCallback(async (movie) => {
    if (!user.id) return null;
    const res = await postFetch(`/communitylibrary/movies/add/${user.id}`, { ...emptyMovie(), ...movie });
    await getMovies();
    return res?.error || null;
  }, [user.id, getMovies]);

  /** Saves a whole movie row straight away (used by the collection grid). Returns an error string or null. */
  const saveMovie = useCallback(async (movie) => {
    const res = await postFetch(`/communitylibrary/movies/edit/${user.id}`, movie);
    await getMovies();
    return res?.error || null;
  }, [user.id, getMovies]);

  const deleteMovie = useCallback(async (i) => {
    await postFetch(`/communitylibrary/movies/delete/${user.id}`, { id: movies[i].id });
    await getMovies();
  }, [movies, user.id, getMovies]);

  return { movies, getMovies, addMovie, saveMovie, uploadMoviePoster, deleteMovie };
}
