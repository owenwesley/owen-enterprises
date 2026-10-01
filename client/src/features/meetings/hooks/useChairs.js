import { useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch } from '../../../utils/api';

// Same id + isolated-draft pattern as useMemos — see the note there.
export function useChairs() {
  const { state, dispatch } = useAppContext();
  const { chairs, user, editIdx, editDraft } = state;

  const getChairs = useCallback(async () => {
    if (!user.id) return;
    const data = await getFetch(`/meetings/chairs/${user.id}`);
    dispatch({ type: 'SET_CHAIRS', payload: data?.results || [] });
  }, [user.id, dispatch]);

  const addChair = useCallback(async () => {
    if (!user.id) return;
    await postFetch(`/meetings/chairs/add/${user.id}`, { name: 'New Chair' });
    await getChairs();
  }, [user.id, getChairs]);

  const handleChairChange = useCallback((field, value /*, rowId */) => {
    dispatch({ type: 'UPDATE_EDIT_DRAFT', payload: { name: field, value } });
  }, [dispatch]);

  const startEditingChair = useCallback((rowId) => {
    const row = chairs.find((c) => c.id === rowId);
    if (!row) return;
    dispatch({ type: 'BEGIN_EDIT', payload: { rowId, row } });
  }, [chairs, dispatch]);

  const cancelEditingChair = useCallback(() => {
    dispatch({ type: 'CANCEL_EDIT' });
  }, [dispatch]);

  const stopEditingChair = useCallback(async () => {
    const original = chairs.find((c) => c.id === editIdx);
    dispatch({ type: 'CANCEL_EDIT' });
    if (!original) { await getChairs(); return; }

    const chair = { ...original, ...(editDraft || {}) };
    dispatch({ type: 'SET_CHAIRS', payload: chairs.map((c) => (c.id === original.id ? chair : c)) });
    await postFetch(`/meetings/chairs/edit/${user.id}`, { id: chair.id, name: chair.name });
    await getChairs();
  }, [chairs, editIdx, editDraft, user.id, dispatch, getChairs]);

  const deleteChair = useCallback(async (rowId) => {
    await postFetch(`/meetings/chairs/delete/${user.id}`, { id: rowId });
    await getChairs();
  }, [user.id, getChairs]);

  // Flat list of names for dropdowns
  const chairNames = chairs.map((c) => c.name);

  return { chairs, editIdx, editDraft, chairNames, getChairs, addChair, handleChairChange, startEditingChair, stopEditingChair, cancelEditingChair, deleteChair };
}
