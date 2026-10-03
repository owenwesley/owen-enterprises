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
    });
  }
  return slots;
}

/** Returns a copy of the movie with film `slot` removed and later films shifted up. */
export function removeFilm(movie, slot) {
  const n = filmCount(movie);
  const out = { ...movie };
  for (let i = slot; i <= 12; i++) {
    const from = i + 1;
    out[`name${i}`]   = from <= 12 ? movie[`name${from}`]   : '';
    out[`rated${i}`]  = from <= 12 ? movie[`rated${from}`]  : 'NR';
    out[`length${i}`] = from <= 12 ? movie[`length${from}`] : 0;
    out[`yearR${i}`]  = from <= 12 ? movie[`yearR${from}`]  : 0;
    out[`media${i}`]  = from <= 12 ? movie[`media${from}`]  : 'DVD';
  }
  out.numMovie = Math.max(n - 1, 1);
  out.featureMedia = featureTypeFor(out.numMovie);
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
  }
  return row;
}

export function useMovies() {
  const { state, dispatch } = useAppContext();
  const { movies, user, editIdx } = state;

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

  const addMovie = useCallback(async (movie) => {
    if (!user.id) return;
    await postFetch(`/communitylibrary/movies/add/${user.id}`, { ...emptyMovie(), ...movie });
    await getMovies();
  }, [user.id, getMovies]);

  /** Saves a whole movie row straight away (used by the collection grid). Returns an error string or null. */
  const saveMovie = useCallback(async (movie) => {
    const res = await postFetch(`/communitylibrary/movies/edit/${user.id}`, movie);
    await getMovies();
    return res?.error || null;
  }, [user.id, getMovies]);

  const handleMovieChange = useCallback((field, value, i) => {
    dispatch({
      type: 'SET_MOVIES',
      payload: movies.map((m, j) => j === i ? { ...m, [field]: value } : m),
    });
  }, [movies, dispatch]);

  const startEditingMovie = useCallback((i) => {
    dispatch({ type: 'SET_EDIT_IDX', payload: i });
  }, [dispatch]);

  const stopEditingMovie = useCallback(async () => {
    const movie = movies[editIdx];
    dispatch({ type: 'SET_EDIT_IDX', payload: -1 });
    await postFetch(`/communitylibrary/movies/edit/${user.id}`, movie);
    await getMovies();
  }, [movies, editIdx, user.id, dispatch, getMovies]);

  const deleteMovie = useCallback(async (i) => {
    await postFetch(`/communitylibrary/movies/delete/${user.id}`, { id: movies[i].id });
    await getMovies();
  }, [movies, user.id, getMovies]);

  return {
    movies, editIdx,
    getMovies, addMovie, saveMovie, uploadMoviePoster,
    handleMovieChange, startEditingMovie, stopEditingMovie, deleteMovie,
  };
}
