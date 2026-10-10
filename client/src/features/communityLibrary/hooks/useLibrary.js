import { useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch, postFormData } from '../../../utils/api';

// ── useBooks ──────────────────────────────────────────────────────────────────
export function useBooks() {
  const { state, dispatch } = useAppContext();
  const { books, user } = state;

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

  /** Adds a book. Returns an error string or null. */
  const addBook = useCallback(async (book) => {
    if (!user.id) return null;
    const res = await postFetch(`/communitylibrary/books/add/${user.id}`, {
      title: 'New Book', author: '', publisher: '', copywrite: '',
      isbn: '', io: 'In', who: 'In Library', lost: 'No', img_url: '',
      ...book,
    });
    await getBooks();
    return res?.error || null;
  }, [user.id, getBooks]);

  /** Saves a whole book row straight away (the dialog holds the edited row). Returns an error string or null. */
  const saveBook = useCallback(async (book) => {
    const res = await postFetch(`/communitylibrary/books/edit/${user.id}`, book);
    await getBooks();
    return res?.error || null;
  }, [user.id, getBooks]);

  const deleteBook = useCallback(async (i) => {
    await postFetch(`/communitylibrary/books/delete/${user.id}`, { id: books[i].id });
    await getBooks();
  }, [books, user.id, getBooks]);

  /** One tap: mark an Out book back In (server: only this user's row, only if Out and not Lost). Returns an error string or null. */
  const markReturned = useCallback(async (id) => {
    const res = await postFetch(`/communitylibrary/returned/${user.id}`, { kind: 'book', id });
    await getBooks();
    return res?.error || null;
  }, [user.id, getBooks]);

  return { books, getBooks, addBook, saveBook, uploadBookCover, deleteBook, markReturned };
}

