import { useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch } from '../../../utils/api';

// editIdx holds the row's database id; editDraft holds an isolated
// in-progress copy — same BEGIN_EDIT / UPDATE_EDIT_DRAFT / CANCEL_EDIT
// pattern as BP/weights/medications/nutrition. Previously editIdx was a raw
// array index and every keystroke wrote straight into the shared memos array.
export function useMemos() {
  const { state, dispatch } = useAppContext();
  const { memos, user, editIdx, editDraft } = state;

  const getMemos = useCallback(async () => {
    if (!user.id) return;
    const data = await getFetch(`/meetings/memos/${user.id}`);
    dispatch({ type: 'SET_MEMOS', payload: data?.results || [] });
  }, [user.id, dispatch]);

  const addMemo = useCallback(async () => {
    if (!user.id) return;
    await postFetch(`/meetings/memos/add/${user.id}`, { name: 'N/A' });
    await getMemos();
  }, [user.id, getMemos]);

  const handleMemoChange = useCallback((field, value /*, rowId */) => {
    dispatch({ type: 'UPDATE_EDIT_DRAFT', payload: { name: field, value } });
  }, [dispatch]);

  const startEditingMemo = useCallback((rowId) => {
    const row = memos.find((m) => m.id === rowId);
    if (!row) return;
    dispatch({ type: 'BEGIN_EDIT', payload: { rowId, row } });
  }, [memos, dispatch]);

  const cancelEditingMemo = useCallback(() => {
    dispatch({ type: 'CANCEL_EDIT' });
  }, [dispatch]);

  const stopEditingMemo = useCallback(async () => {
    const original = memos.find((m) => m.id === editIdx);
    dispatch({ type: 'CANCEL_EDIT' });
    if (!original) { await getMemos(); return; }

    const memo = { ...original, ...(editDraft || {}) };
    dispatch({ type: 'SET_MEMOS', payload: memos.map((m) => (m.id === original.id ? memo : m)) });
    await postFetch(`/meetings/memos/edit/${user.id}`, { id: memo.id, name: memo.name });
    await getMemos();
  }, [memos, editIdx, editDraft, user.id, dispatch, getMemos]);

  const deleteMemo = useCallback(async (rowId) => {
    await postFetch(`/meetings/memos/delete/${user.id}`, { id: rowId });
    await getMemos();
  }, [user.id, getMemos]);

  const memoNames = memos.map((m) => m.name);

  return { memos, editIdx, editDraft, memoNames, getMemos, addMemo, handleMemoChange, startEditingMemo, stopEditingMemo, cancelEditingMemo, deleteMemo };
}
