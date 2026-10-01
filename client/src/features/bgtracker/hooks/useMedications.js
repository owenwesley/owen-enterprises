import { useCallback } from 'react';
import { coerceByFieldName } from '../../../utils/coerceInput';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch } from '../../../utils/api';

const MED_NUMERIC = ['quantity', 'am', 'noon', 'evening', 'bed'];

// ── standalone helper used by useReadings ─────────────────────────────────────
// Saves one medication row directly (e.g. after an insulin-deduction
// recalculation). Unrelated to the id+draft table-editing pattern below —
// `medications[i]` here is a locally-built array the caller already
// constructed by id-lookup, not the shared editIdx/editDraft state.
export async function editMeds(user, medications, i) {
  const m = medications[i];
  await postFetch(`/bgtracker/medications/edit/${user.id}`, {
    id: m.id, user_id: user.id, name: m.name, dose: m.dose,
    unit: m.unit, quantity: m.quantity, prescriber: m.prescriber,
    am: m.am, noon: m.noon, evening: m.evening, bed: m.bed,
  }).catch(console.error);
}

// ── hook ──────────────────────────────────────────────────────────────────────
// editIdx holds the row's database id (not an array index) and editDraft holds
// an isolated in-progress copy — same pattern as BP/weights. Previously editIdx
// was a raw array index and every keystroke wrote directly into the shared
// medications array, so a background refetch or re-sort mid-edit could
// retarget the edit at the wrong row or lose keystrokes outright.
export function useMedications() {
  const { state, dispatch } = useAppContext();
  const { medications, user, editIdx, editDraft } = state;

  const getMedications = useCallback(async (user_id) => {
    if (!user_id) return;
    const data = await getFetch(`/bgtracker/medications/${user_id}`);
    dispatch({ type: 'SET_MEDICATIONS', payload: data?.results || [] });
  }, [dispatch]);

  const addMedication = useCallback(async () => {
    const { name = 'Name', prescriber = 'Name' } = state.medication || {};
    const newMed = {
      user_id: user.id, name, dose: '0.00', unit: 'G',
      quantity: 0, prescriber, am: 0, noon: 0, evening: 0, bed: 0,
    };
    dispatch({ type: 'SET_MEDICATIONS', payload: [...medications, newMed] });
    await postFetch(`/bgtracker/medications/add/${user.id}`, newMed).catch(console.error);
    await getMedications(user.id);
  }, [state.medication, user, medications, dispatch, getMedications]);

  // rowId is the row's database id. Keystrokes write ONLY to the isolated
  // editDraft, so re-renders and background refetches can't wipe what's
  // being typed. The draft is merged back into the data only on explicit save.
  const handleMedicationChange = useCallback((e, name /*, rowId */) => {
    const value = coerceByFieldName(e, name);
    dispatch({ type: 'UPDATE_EDIT_DRAFT', payload: { name, value } });
  }, [dispatch]);

  const startEditingMedication = useCallback((rowId) => {
    const row = medications.find((r) => r.id === rowId);
    if (!row) return;
    dispatch({ type: 'BEGIN_EDIT', payload: { rowId, row } });
  }, [medications, dispatch]);

  const cancelEditingMedication = useCallback(() => {
    dispatch({ type: 'CANCEL_EDIT' });
  }, [dispatch]);

  const stopEditingMedication = useCallback(async () => {
    const original = medications.find((r) => r.id === editIdx);
    dispatch({ type: 'CANCEL_EDIT' }); // clears editIdx AND the draft
    if (!original) { await getMedications(user.id); return; }   // nothing saveable

    // Merge the draft over the stored row — the only point edits reach state.
    const row = { ...original, ...(editDraft || {}) };
    for (const f of MED_NUMERIC) row[f] = Number(row[f]) || 0;   // '' -> 0

    dispatch({
      type: 'SET_MEDICATIONS',
      payload: medications.map((r) => (r.id === original.id ? row : r)),
    });
    const res = await postFetch(`/bgtracker/medications/edit/${user.id}`, {
      id: row.id, user_id: user.id, name: row.name, dose: row.dose,
      unit: row.unit, quantity: row.quantity, prescriber: row.prescriber,
      am: row.am, noon: row.noon, evening: row.evening, bed: row.bed,
    });
    if (res?.error) console.error('Medication save failed:', res.error);
    await getMedications(user.id);   // re-sort / revert to server truth
  }, [medications, editIdx, editDraft, user, dispatch, getMedications]);

  const handleMedicationDelete = useCallback(async (rowId) => {
    await postFetch(`/bgtracker/medications/delete/${user.id}`, {
      id: rowId,
    }).catch(console.error);
    dispatch({ type: 'SET_MEDICATIONS', payload: medications.filter((r) => r.id !== rowId) });
  }, [medications, user, dispatch]);

  return {
    medications,
    getMedications,
    addMedication,
    handleMedicationChange,
    startEditingMedication,
    stopEditingMedication,
    cancelEditingMedication,
    handleMedicationDelete,
    editDraft,
  };
}
