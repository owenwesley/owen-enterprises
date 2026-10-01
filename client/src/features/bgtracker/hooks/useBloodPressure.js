import { useCallback } from 'react';
import { coerceByFieldName } from '../../../utils/coerceInput';
import { todayFormatted } from '../../../utils/dateFormat';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch } from '../../../utils/api';

const BP_NUMERIC = ['hbp', 'lbp', 'hr', 'hbp2', 'lbp2', 'hr2'];

export function useBloodPressure() {
  const { state, dispatch } = useAppContext();
  const { bloodpressures, user, editIdx, editDraft } = state;

  const getBloodPressures = useCallback(async (user_id) => {
    if (!user_id) return;
    const data = await getFetch(`/bgtracker/bloodpressures/${user_id}`);
    dispatch({ type: 'SET_BLOODPRESSURES', payload: data?.results || [] });
    computeAvgBp(data?.results, dispatch);
  }, [dispatch]);

  const addBP = useCallback(async () => {
    const bp = state.bloodpressure || {};
    const { date = todayFormatted(), hbp = 0, lbp = 0, hr = 0, hbp2 = 0, lbp2 = 0, hr2 = 0 } = bp;
    const newRow = { user_id: user.id, date, hbp, lbp, hr, hbp2, lbp2, hr2 };

    let updated = [...bloodpressures];
    if (bloodpressures.length >= 90) {
      await postFetch(`/bgtracker/bloodpressures/delete/${user.id}`, {
        id: bloodpressures[0]?.id,   // oldest row (list is sorted by date)
      }).catch(console.error);
      updated.splice(0, 1);
    }
    updated = [...updated, newRow];
    dispatch({ type: 'SET_BLOODPRESSURES', payload: updated });
    await postFetch(`/bgtracker/bloodpressures/add/${user.id}`, newRow).catch(console.error);
    await getBloodPressures(user.id);   // pick up the new row's real id (needed to edit it)
  }, [state.bloodpressure, bloodpressures, user, dispatch, getBloodPressures]);

  // `rowId` is the row's database id, not its array position.
  // Keystrokes write ONLY to the isolated editDraft, so re-renders and
  // background refetches can't wipe what's being typed. The draft is merged
  // back into the data only on explicit save.
  const handleBPChange = useCallback((e, name /*, rowId */) => {
    const value = coerceByFieldName(e, name);
    dispatch({ type: 'UPDATE_EDIT_DRAFT', payload: { name, value } });
  }, [dispatch]);

  const startEditingBP = useCallback((rowId) => {
    const row = bloodpressures.find((r) => r.id === rowId);
    if (!row) return;
    dispatch({ type: 'BEGIN_EDIT', payload: { rowId, row } });
  }, [bloodpressures, dispatch]);

  const cancelEditingBP = useCallback(() => {
    dispatch({ type: 'CANCEL_EDIT' });
  }, [dispatch]);

  const stopEditingBP = useCallback(async () => {
    const original = bloodpressures.find((r) => r.id === editIdx);
    dispatch({ type: 'CANCEL_EDIT' }); // clears editIdx AND the draft
    if (!original) { await getBloodPressures(user.id); return; }   // nothing saveable

    // Merge the draft over the stored row — the only point edits reach state.
    const row = { ...original, ...(editDraft || {}) };
    if (!row.date) row.date = original.date;           // cleared date input
    for (const f of BP_NUMERIC) row[f] = Number(row[f]) || 0;   // '' -> 0

    dispatch({
      type: 'SET_BLOODPRESSURES',
      payload: bloodpressures.map((r) => (r.id === original.id ? row : r)),
    });
    const res = await postFetch(`/bgtracker/bloodpressures/edit/${user.id}`, {
      id: row.id, user_id: user.id, date: row.date,
      hbp: row.hbp, lbp: row.lbp, hr: row.hr,
      hbp2: row.hbp2, lbp2: row.lbp2, hr2: row.hr2,
    });
    // postFetch resolves with the error body instead of throwing.
    if (res?.error) console.error('BP save failed:', res.error);
    await getBloodPressures(user.id);   // re-sort / revert to server truth
  }, [bloodpressures, editIdx, editDraft, user, dispatch, getBloodPressures]);

  return { bloodpressures, getBloodPressures, addBP, handleBPChange, startEditingBP, stopEditingBP, cancelEditingBP, editDraft };
}

// ── average blood pressure calculation ────────────────────────────────────────
function computeAvgBp(bloodpressures, dispatch) {
  if (!bloodpressures || bloodpressures.length === 0) return;
  const sum = (field) => bloodpressures.reduce((acc, bp) => acc + parseInt(bp[field] || 0, 10), 0);
  const avghbp = (sum('hbp') + sum('hbp2')) / 90;
  const avglbp = (sum('lbp') + sum('lbp2')) / 90;
  const avghr  = (sum('hr')  + sum('hr2'))  / 90;
  dispatch({
    type: 'SET_AVG_BP',
    payload: `${avghbp.toFixed(0)}/${avglbp.toFixed(0)}/${avghr.toFixed(0)}`,
  });
}
