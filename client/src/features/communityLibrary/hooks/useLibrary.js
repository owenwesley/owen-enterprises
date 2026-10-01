import { useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch, postFormData } from '../../../utils/api';

// ── useBooks ──────────────────────────────────────────────────────────────────
export function useBooks() {
  const { state, dispatch } = useAppContext();
  const { books, user, editIdx } = state;

  // getFetch uses registerTokenGetter so it always sends the current token —
  // no need to include state.token in the dep array.
  const getBooks = useCallback(async () => {
    if (!user.id) return;
    const data = await getFetch(`/communitylibrary/books/${user.id}`);
    dispatch({ type: 'SET_BOOKS', payload: data?.results || [] });
  }, [user.id, dispatch]);

  /**
   * Uploads a book cover image (or triggers the server's placeholder
   * fallback if `file` is null) and returns the resulting img_url.
   */
  const uploadBookCover = useCallback(async (title, file, theme) => {
    const formData = new FormData();
    formData.append('title', title);
    if (theme) formData.append('theme', theme);
    if (file)  formData.append('image', file);
    const data = await postFormData('/communitylibrary/upload/book', formData);
    return data?.img_url || null;
  }, []);

  const addBook = useCallback(async (book) => {
    if (!user.id) return;
    await postFetch(`/communitylibrary/books/add/${user.id}`, {
      title: 'New Book', author: '', publisher: '', copywrite: '',
      isbn: '', io: 'In', who: 'In Library', lost: 'No', img_url: '',
      ...book,
    });
    await getBooks();
  }, [user.id, getBooks]);

  const handleBookChange = useCallback((field, value, i) => {
    dispatch({
      type: 'SET_BOOKS',
      payload: books.map((b, j) => j === i ? { ...b, [field]: value } : b),
    });
  }, [books, dispatch]);

  const startEditingBook = useCallback((i) => {
    dispatch({ type: 'SET_EDIT_IDX', payload: i });
  }, [dispatch]);

  const stopEditingBook = useCallback(async () => {
    const book = books[editIdx];
    dispatch({ type: 'SET_EDIT_IDX', payload: -1 });
    await postFetch(`/communitylibrary/books/edit/${user.id}`, book);
    await getBooks();
  }, [books, editIdx, user.id, dispatch, getBooks]);

  const deleteBook = useCallback(async (i) => {
    await postFetch(`/communitylibrary/books/delete/${user.id}`, { id: books[i].id });
    await getBooks();
  }, [books, user.id, getBooks]);

  return { books, getBooks, addBook, uploadBookCover, handleBookChange, startEditingBook, stopEditingBook, deleteBook };
}

