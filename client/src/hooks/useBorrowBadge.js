import { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { getFetch } from '../utils/api';

// Number of borrow requests waiting for THIS person's answer: { books, movies, total }.
// Checked on load, once a minute, whenever the tab regains focus, and right after the
// requests list changes (useBorrow in SharedResults.jsx fires 'oe:borrow-changed').
// Only for people who have Community Library switched on (that is where requests are answered).
export function useBorrowBadge() {
  const { state } = useAppContext();
  const userId = state.user.id;
  const role = state.user.role;
  const enabled = !!state.user.isLogedIn && !!userId && role !== 'doctor' && role !== 'admin'
    && state.featurePreferences?.chkCommunityLibrary === 1;
  const [counts, setCounts] = useState({ books: 0, movies: 0, total: 0 });

  const load = useCallback(() => {
    if (!enabled) return Promise.resolve();
    return getFetch(`/church/borrow-count/${userId}`)
      .then((d) => {
        const books = Number(d?.books) || 0, movies = Number(d?.movies) || 0;
        setCounts((c) => (c.books === books && c.movies === movies ? c : { books, movies, total: books + movies }));
      })
      .catch(() => { /* leave the last number */ });
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled) { setCounts({ books: 0, movies: 0, total: 0 }); return undefined; }
    load();
    const timer = setInterval(load, 60000);
    const onFocus = () => { if (document.visibilityState !== 'hidden') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('oe:borrow-changed', load);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('oe:borrow-changed', load);
    };
  }, [enabled, load]);

  return counts;
}
