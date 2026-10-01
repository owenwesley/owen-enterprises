import { useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch, postFormData } from '../../../utils/api';

// Suffixes that mark a row as a multi-film release rather than a single movie.
// Matched case-insensitively against the trailing words of `name`.
const COLLECTION_SUFFIXES = [
  'double feature', 'triple feature', 'quadruple feature', 'box set',
];

/** True if this movie's name ends with one of the collection suffixes. */
export function isCollection(movie) {
  const name = (movie.name || '').trim().toLowerCase();
  return COLLECTION_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/** Returns the filled-in film slots (1..12) for a movie row, in order. */
export function collectionSlots(movie) {
  const slots = [];
  const count = Math.min(Math.max(parseInt(movie.numMovie, 10) || 1, 1), 12);
  for (let i = 1; i <= count; i++) {
    const name = movie[`name${i}`];
    if (!name) continue;
    slots.push({
      slot:  i,
      name:  name,
      rated: movie[`rated${i}`]  || 'NR',
      len:   movie[`length${i}`] || 0,
      year:  movie[`yearR${i}`]  || 0,
      media: movie[`media${i}`]  || 'DVD',
    });
  }
  return slots;
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
    getMovies, addMovie, uploadMoviePoster,
    handleMovieChange, startEditingMovie, stopEditingMovie, deleteMovie,
  };
}
