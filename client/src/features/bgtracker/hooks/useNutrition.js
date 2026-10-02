import { useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch } from '../../../utils/api';
import { todayFormatted } from '../../../utils/dateFormat';
import { NUTRITION_SLOTS, NUTRIENT_HEADERS } from '../components/Tables/nutritionColumns';

// Slot and column definitions live in components/Tables/nutritionColumns.js (the
// header is built from them). MEAL_SLOTS is every slot the database stores;
// the table and dialog only show the ones nutritionSlotsFor(timesPD) returns.
export const MEAL_SLOTS = NUTRITION_SLOTS;

export const NUTRIENT_FIELDS = NUTRIENT_HEADERS.map(({ key, name, type }) => ({ key, label: name, type }));

/** Builds an empty nutrition row with all 90 macro fields defaulted */
export function emptyNutrition(user_id) {
  const row = { user_id, date: todayFormatted() };
  MEAL_SLOTS.forEach(({ key: suffix }) => {
    NUTRIENT_FIELDS.forEach(({ key }) => {
      const field = `${key}${suffix}`;
      row[field] = key === 'foodName' ? '' : 0;
    });
  });
  return row;
}

/**
 * Sums a nutrient across meal slots for a row (e.g. total calories for the day).
 * `slots` defaults to all 5; the Nutrition table passes only the slots it shows,
 * so the total matches the columns on screen.
 */
export function dailyTotal(row, nutrientKey, slots = MEAL_SLOTS) {
  return slots.reduce((sum, { key: suffix }) => {
    const v = parseFloat(row[`${nutrientKey}${suffix}`] || 0);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
}

// editIdx holds the row's database id (not an array index) and editDraft holds
// an isolated in-progress copy — same BEGIN_EDIT / UPDATE_EDIT_DRAFT / CANCEL_EDIT
// pattern as BP/weights/medications. Nutrition edits through a modal dialog
// rather than inline table cells, but the underlying bug was identical: every
// keystroke used to write straight into the shared nutritions array by index.
export function useNutrition() {
  const { state, dispatch } = useAppContext();
  const { nutritions, user, editIdx, editDraft } = state;

  const getNutritions = useCallback(async () => {
    if (!user.id) return;
    const data = await getFetch(`/bgtracker/nutritions/${user.id}`);
    dispatch({ type: 'SET_NUTRITIONS', payload: data?.results || [] });
  }, [user.id, dispatch]);

  const addNutrition = useCallback(async () => {
    if (!user.id) return;
    const row = emptyNutrition(user.id);
    await postFetch(`/bgtracker/nutritions/add/${user.id}`, row);
    await getNutritions();
  }, [user.id, getNutritions]);

  // rowId is the row's database id; kept as a param for callers/readability
  // even though the draft update itself doesn't need to know which row.
  const handleNutritionChange = useCallback((e, field /*, rowId */) => {
    const value = e.target.value;
    dispatch({ type: 'UPDATE_EDIT_DRAFT', payload: { name: field, value } });
  }, [dispatch]);

  const startEditing = useCallback((rowId) => {
    const row = nutritions.find((r) => r.id === rowId);
    if (!row) return;
    dispatch({ type: 'BEGIN_EDIT', payload: { rowId, row } });
  }, [nutritions, dispatch]);

  const cancelEditing = useCallback(() => {
    dispatch({ type: 'CANCEL_EDIT' });
  }, [dispatch]);

  const stopEditing = useCallback(async () => {
    const original = nutritions.find((r) => r.id === editIdx);
    dispatch({ type: 'CANCEL_EDIT' }); // clears editIdx AND the draft
    if (!original) { await getNutritions(); return; }

    const row = { ...original, ...(editDraft || {}) };
    dispatch({
      type: 'SET_NUTRITIONS',
      payload: nutritions.map((r) => (r.id === original.id ? row : r)),
    });
    await postFetch(`/bgtracker/nutritions/edit/${user.id}`, row);
    await getNutritions();
  }, [nutritions, editIdx, editDraft, user.id, dispatch, getNutritions]);

  const deleteNutrition = useCallback(async (rowId) => {
    await postFetch(`/bgtracker/nutritions/delete/${user.id}`, { id: rowId });
    await getNutritions();
  }, [user.id, getNutritions]);

  return {
    nutritions, editIdx, editDraft,
    getNutritions, addNutrition,
    handleNutritionChange, startEditing, stopEditing, cancelEditing, deleteNutrition,
  };
}
