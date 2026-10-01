import { useCallback } from 'react';
import { coerceByFieldName } from '../../../utils/coerceInput';
import { todayFormatted } from '../../../utils/dateFormat';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch, notifyError } from '../../../utils/api';

// Same id + isolated-draft pattern as useBloodPressure.js. Previously this
// hook used the row's array INDEX as the edit target and wrote every
// keystroke straight into the shared `weights` array (via defaultValue
// inputs in WeightRow), which is the same bug class the very first BP fix in
// this project addressed: editing after the table re-sorts or a background
// refetch fires could target the wrong row, or lose keystrokes outright.
export function useWeights() {
  const { state, dispatch } = useAppContext();
  const { weights, user, editIdx, editDraft } = state;
  const { height } = state.preference;

  const getWeights = useCallback(async (user_id) => {
    if (!user_id) return;
    const data = await getFetch(`/bgtracker/weights/${user_id}`);
    dispatch({ type: 'SET_WEIGHTS', payload: data?.results || [] });
  }, [dispatch]);

  const addWeight = useCallback(async () => {
    const w = state.weight || {};
    const { date = todayFormatted(), kg = 0, lbs = 0, bmi = 0 } = w;
    const newRow = { user_id: user.id, date, kg, lbs, bmi };

    let updated = [...weights];
    if (weights.length >= 90) {
      // Delete oldest record (index 0) to make room
      await postFetch(`/bgtracker/weights/delete/${user.id}`, {
        id: weights[0]?.id,
      }).catch(console.error);
      updated.splice(0, 1);
    }
    updated = [...updated, newRow];
    dispatch({ type: 'SET_WEIGHTS', payload: updated });
    await postFetch(`/bgtracker/weights/add/${user.id}`, newRow).catch(console.error);
    await getWeights(user.id);   // pick up the new row's real id (needed to edit it)
  }, [state.weight, weights, user, dispatch, getWeights]);

  // `rowId` is the row's database id, not its array position.
  // Keystrokes write ONLY to the isolated editDraft, so re-renders and
  // background refetches can't wipe what's being typed. The draft is merged
  // back into the data only on explicit save (stopEditingWeight).
  const handleWeightChange = useCallback((e, name /*, rowId */) => {
    const value = coerceByFieldName(e, name);
    // kg and lbs are two views of the same number. Show the converted value in
    // the other box as you type (it used to be blanked, which left the box
    // showing only its "LBS"/"KG" label instead of a number), and remember
    // which one was typed so the save treats that one as the source of truth.
    dispatch({ type: 'UPDATE_EDIT_DRAFT', payload: { name, value } });
    if (name === 'kg' || name === 'lbs') {
      dispatch({ type: 'UPDATE_EDIT_DRAFT', payload: { name: '_edited', value: name } });
      const other = name === 'kg' ? 'lbs' : 'kg';
      const factor = name === 'kg' ? 2.20462 : 1 / 2.20462;
      const converted = value === '' ? 0 : parseFloat((value * factor).toFixed(2));
      dispatch({ type: 'UPDATE_EDIT_DRAFT', payload: { name: other, value: converted } });
    }
  }, [dispatch]);

  const startEditingWeight = useCallback((rowId) => {
    const row = weights.find((r) => r.id === rowId);
    if (!row) return;
    // Seed the draft with a snapshot of the row being edited.
    dispatch({ type: 'BEGIN_EDIT', payload: { rowId, row } });
  }, [weights, dispatch]);

  // Discard an in-progress edit without saving.
  const cancelEditingWeight = useCallback(() => {
    dispatch({ type: 'CANCEL_EDIT' });
  }, [dispatch]);

  const stopEditingWeight = useCallback(async () => {
    const original = weights.find((r) => r.id === editIdx);
    dispatch({ type: 'CANCEL_EDIT' }); // clears editIdx AND the draft
    if (!original) { await getWeights(user.id); return; }   // nothing saveable

    // Merge the isolated draft over the stored row — the only point an edit
    // reaches the primary data.
    let w = { ...original, ...(editDraft || {}) };
    if (!w.date) w.date = original.date;   // cleared date input

    // Auto-calculate BMI and convert units
    const useLbs = w._edited === 'lbs';
    if (!useLbs && w.kg && w.kg !== 0 && w.kg !== '') {
      const kg  = parseFloat(w.kg);
      const lbs = parseFloat((kg * 2.20462).toFixed(2));
      // No height in preferences → can't compute BMI (it used to become Infinity and the save failed)
      const bmi = height > 0 ? parseFloat((kg / Math.pow(height / 39.37, 2)).toFixed(2)) : (Number(w.bmi) || 0);
      w = { ...w, kg: parseFloat(kg.toFixed(2)), lbs, bmi };
    } else if (w.lbs && w.lbs !== 0 && w.lbs !== '') {
      const lbs = parseFloat(w.lbs);
      const kg  = parseFloat((lbs / 2.20462).toFixed(2));
      const bmi = height > 0 ? parseFloat((lbs / Math.pow(height, 2) * 703).toFixed(2)) : (Number(w.bmi) || 0);
      w = { ...w, kg, lbs: parseFloat(lbs.toFixed(2)), bmi };
    }

    // A cleared kg/lbs box used to be saved as 0. Keep the stored weight and
    // tell the person instead.
    if (!(Number(w.kg) > 0)) {
      notifyError('Enter a weight greater than 0 before saving. Your previous weight was kept.');
      await getWeights(user.id);   // put the table back to what is stored
      return;
    }

    dispatch({
      type: 'SET_WEIGHTS',
      payload: weights.map((r) => (r.id === original.id ? w : r)),
    });

    const res = await postFetch(`/bgtracker/weights/edit/${user.id}`, {
      id: w.id, user_id: user.id, date: w.date, kg: w.kg, lbs: w.lbs, bmi: w.bmi,
    });
    // postFetch resolves with the error body instead of throwing.
    if (res?.error) console.error('Weight save failed:', res.error);
    await getWeights(user.id);   // re-sort / revert to server truth
  }, [weights, editIdx, editDraft, user, height, dispatch, getWeights]);

  return {
    weights, getWeights, addWeight, handleWeightChange,
    startEditingWeight, stopEditingWeight, cancelEditingWeight, editDraft,
  };
}
