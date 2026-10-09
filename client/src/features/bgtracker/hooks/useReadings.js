import { useCallback } from 'react';
import { coerceByFieldName } from '../../../utils/coerceInput';
import { useAppContext } from '../../../context/AppContext';
import { postFetch, getFetch } from '../../../utils/api';
import { todayFormatted, tenYearRetentionDays, earliestYear } from '../../../utils/dateFormat';
import { calcSlidingScale } from '../utils/slidingScale';
import { editMeds } from './useMedications';
import { deductMeds } from '../utils/medications';

// ── server helpers (re-exported so other hooks can use them) ────────────────────

/**
 * Bulk-deletes every reading from the earliest calendar year present in
 * `readings`, even if that year has gaps/missing days. This replaces the old
 * behaviour of deleting a single oldest row — once the retention window
 * rolls past a full year boundary (e.g. 10 complete years 2020-2029 and the
 * calendar turns to 2030), the ENTIRE earliest year (2020) is removed in one
 * pass rather than trimmed one row at a time.
 */
export async function deleteEarliestYearFromServer(user, readings) {
  const year = earliestYear(readings);
  if (year == null) return null;
  const twoDigitYear = String(year).slice(-2);
  await postFetch(`/bgtracker/readings/deleteByYear/${user.id}`, { year: twoDigitYear })
    .catch(console.error);
  return year;
}

export async function saveReading(user, readings, editIdx) {
  const r = readings[editIdx];
  await postFetch(`/bgtracker/readings/edit/${user.id}`, {
    id: r.id, user_id: user.id, date: r.date,
    sugarB: r.sugarB, carbsB: r.carbsB,
    insulinSB: r.insulinSB, insulinFB: r.insulinFB, chkMedsB: r.chkMedsB,
    sugarL: r.sugarL, carbsL: r.carbsL, insulinL: r.insulinL, chkMedsL: r.chkMedsL,
    sugarD: r.sugarD, carbsD: r.carbsD, insulinD: r.insulinD, chkMedsD: r.chkMedsD,
    sugarBB: r.sugarBB, carbsBB: r.carbsBB, insulinBB: r.insulinBB,
    sugarBed: r.sugarBed, carbsBed: r.carbsBed,
    insulinSBed: r.insulinSBed, insulinFBed: r.insulinFBed, chkMedsBed: r.chkMedsBed,
  }).catch(console.error);
}

// ── hook ────────────────────────────────────────────────────────────────────────
export function useReadings() {
  const { state, dispatch } = useAppContext();
  const { readings, user, editIdx, editDraft, medications } = state;
  const pref = state.preference;

  // ── fetch from server ──────────────────────────────────────────────────────
  const getReadings = useCallback(async (user_id) => {
    const data = await getFetch(`/bgtracker/readings/${user_id}`);
    dispatch({ type: 'SET_READINGS', payload: data?.results || [] });
  }, [dispatch]);

  // ── add a new reading row ──────────────────────────────────────────────────
  // Fix: retention window expanded from a hardcoded 120 rows (~120 days) to
  // a full 10 calendar years, using a leap-year-aware day count (3651-3653,
  // computed live from the real calendar rather than a fixed guess — see
  // tenYearRetentionDays() in utils/dateFormat.js). When the cap is hit, the
  // entire earliest calendar year is deleted in bulk (not just one row) —
  // see deleteEarliestYearFromServer() above.
  const addReading = useCallback(async () => {
    const r = state.reading || {};
    const newRow = {
      user_id: user.id, date: r.date || todayFormatted(),
      sugarB: 0, carbsB: 0, insulinSB: 0, insulinFB: 0, chkMedsB: false,
      sugarL: 0, carbsL: 0, insulinL: 0, chkMedsL: false,
      sugarD: 0, carbsD: 0, insulinD: 0, chkMedsD: false,
      sugarBB: 0, carbsBB: 0, insulinBB: 0,
      sugarBed: 0, carbsBed: 0, insulinSBed: 0, insulinFBed: 0, chkMedsBed: false,
    };

    const retentionCap = tenYearRetentionDays();
    let updated = [...readings];

    if (readings.length >= retentionCap) {
      const droppedYear = await deleteEarliestYearFromServer(user, readings);
      if (droppedYear != null) {
        updated = updated.filter((row) => {
          const rowYear = row?.date ? Number(`20${String(row.date).slice(-2)}`) : null;
          return rowYear !== droppedYear;
        });
      }
    }

    updated = [...updated, newRow];
    dispatch({ type: 'SET_READINGS', payload: updated });

    await postFetch(`/bgtracker/readings/add/${user.id}`, newRow).catch(console.error);
    // Refetch so the new row gets its real database id. Without it the row has
    // no id, so it can't be edited (or the edit saves nothing) until the next
    // page load.
    await getReadings(user.id);
  }, [state.reading, user, readings, dispatch, getReadings]);

  // ── inline cell change ─────────────────────────────────────────────────────
  // `rowId` is the reading's database id, NOT its array position. Using the
  // id keeps edits correct even though the table only renders a filtered
  // (last-120-days) subset of `readings` — a positional index would point at
  // the wrong record once the view is filtered.
  // Rule 2 (state isolation): keystrokes write ONLY to the temporary draft.
  // Previously each keystroke dispatched SET_READINGS, which rebuilt the
  // readings array and re-ran the 120-day filter on every character — and a
  // background getReadings() refetch could overwrite what was being typed.
  // The draft is immune to both; it's merged back on explicit save.
  const handleReadingChange = useCallback((e, name /*, rowId */) => {
    // Rule 3: coerce to the field's real type — number fields must store
    // numbers, not the strings the DOM hands back.
    const value = coerceByFieldName(e, name);
    dispatch({ type: 'UPDATE_EDIT_DRAFT', payload: { name, value } });
  }, [dispatch]);

  // ── start editing a row ────────────────────────────────────────────────────
  // Stores the row's id (not its index) as the active edit target.
  const startEditingReading = useCallback((rowId) => {
    const row = readings.find((r) => r.id === rowId);
    if (!row) return;
    // Seed the draft with a snapshot of the row being edited.
    dispatch({ type: 'BEGIN_EDIT', payload: { rowId, row } });
  }, [readings, dispatch]);

  // Discard an in-progress edit without saving.
  const cancelEditingReading = useCallback(() => {
    dispatch({ type: 'CANCEL_EDIT' });
  }, [dispatch]);

  // ── stop editing: apply sliding scale, deduct insulin/meds, save ──────────
  const stopEditingReading = useCallback(async () => {
    dispatch({ type: 'CANCEL_EDIT' }); // clears editIdx AND the draft

    const trueIdx = readings.findIndex((r) => r.id === editIdx);
    if (trueIdx === -1) { dispatch({ type: 'CANCEL_EDIT' }); return; }

    // Snapshot the row exactly as it was BEFORE this edit. Needed below to
    // tell a freshly-checked meds box from one that was already checked on
    // a prior save, and to compute a real before/after insulin delta —
    // both were previously computed by comparing a value to itself (see
    // fixes below), so neither ever actually fired.
    const original = readings[trueIdx];

    // Merge the isolated draft over the stored row — this is the ONLY point
    // where in-progress edits reach the primary state.
    const row = { ...original, ...(editDraft || {}) };
    // carbRatio is a DECIMAL column, which the DB driver returns as a string
    // ("0.0000"), and `"0.0000" !== 0` is true — so sliding scale looked
    // "on" for users who never set it up and the maths produced NaN. Compare
    // as a number instead.
    const useSlidingScale = Number(pref.carbRatio) > 0;

    // Fix: this used to fire deductMeds() whenever ANY meds box was
    // checked, with no way to tell a box that was *just* checked from one
    // that was already checked on a prior save — so re-saving an
    // already-checked reading (e.g. to fix an unrelated sugar value)
    // deducted the same scheduled dose again every time. Only a box that
    // transitions from unchecked to checked on THIS edit should deduct.
    const newlyChecked = {
      B:   Boolean(row.chkMedsB)   && !original.chkMedsB,
      L:   Boolean(row.chkMedsL)   && !original.chkMedsL,
      D:   Boolean(row.chkMedsD)   && !original.chkMedsD,
      Bed: Boolean(row.chkMedsBed) && !original.chkMedsBed,
    };

    // Fix: the medication list is only loaded into state when the Medications
    // page is opened (pages.jsx), so on the Readings page `medications` was empty
    // (or stale) and ticking a Meds box deducted nothing. Read the current list
    // from the server right before it is needed. If that request fails, fall back
    // to whatever is in state.
    // ONE working copy of the medication list for this whole save. The
    // sliding-scale deduction and the Meds-tick deduction both read and write
    // it, so the second can't start from the stale pre-edit quantities and
    // overwrite the first for the same medication.
    let workingMeds = [...medications];
    if (useSlidingScale || Object.values(newlyChecked).some(Boolean)) {
      const fresh = await getFetch(`/bgtracker/medications/${user.id}`);
      if (fresh && Array.isArray(fresh.results)) workingMeds = fresh.results;
    }

    if (useSlidingScale) {
      row.insulinFB  = calcSlidingScale(parseInt(row.sugarB  || 0), parseInt(row.carbsB  || 0), pref);
      row.insulinL   = calcSlidingScale(parseInt(row.sugarL  || 0), parseInt(row.carbsL  || 0), pref);
      row.insulinD   = calcSlidingScale(parseInt(row.sugarD  || 0), parseInt(row.carbsD  || 0), pref);
      row.insulinBB  = calcSlidingScale(parseInt(row.sugarBB || 0), parseInt(row.carbsBB || 0), pref);
      row.insulinFBed= calcSlidingScale(parseInt(row.sugarBed|| 0), parseInt(row.carbsBed|| 0), pref);

      const meds = workingMeds;
      // Fix: `prev` used to be read from `row[field]` — the same object
      // `current` reads from, after that field had just been overwritten
      // by calcSlidingScale() a few lines up for 5 of these 9 fields, and
      // for the other 4 it was still the same post-merge value as
      // `current`. `prev !== current` was therefore comparing a value to
      // itself and was always false, so this deduction never ran for any
      // field. `prev` now comes from `original` (the truly pre-edit row),
      // and the medication quantity is reduced by the actual before/after
      // delta rather than the full new dose, so correcting a typo (e.g.
      // 5 -> 8 units) only deducts the extra 3, not 8 again.
      const insulin_deductions = [
        { field: 'insulinFB',  name: 'Fast Acting',  prev: parseInt(original.insulinFB  || 0) },
        { field: 'insulinSB',  name: 'Slow Acting',  prev: parseInt(original.insulinSB  || 0) },
        { field: 'insulinL',   name: 'Fast Acting',  prev: parseInt(original.insulinL   || 0) },
        { field: 'insulinD',   name: 'Fast Acting',  prev: parseInt(original.insulinD   || 0) },
        { field: 'insulinBB',  name: 'Fast Acting',  prev: parseInt(original.insulinBB  || 0) },
        { field: 'insulinFBed',name: 'Fast Acting',  prev: parseInt(original.insulinFBed|| 0) },
        { field: 'insulinSBed',name: 'Slow Acting',  prev: parseInt(original.insulinSBed|| 0) },
      ];

      for (const { field, name, prev } of insulin_deductions) {
        const current = parseInt(row[field] || 0);
        const delta = current - prev;
        if (current !== 0 && delta !== 0) {
          for (let i = 0; i < meds.length; i++) {
            if (meds[i].name === name) {
              meds[i] = { ...meds[i], quantity: meds[i].quantity - delta };
              await editMeds(user, meds, i);
            }
          }
        }
      }
    }

    const updatedReadings = readings.map((r, i) => i === trueIdx ? row : r);
    dispatch({ type: 'SET_READINGS', payload: updatedReadings });

    if (Object.values(newlyChecked).some(Boolean)) {
      // Pass the working list (already reduced by any sliding-scale doses)
      // and keep what it returns.
      workingMeds = await deductMeds(updatedReadings, trueIdx, workingMeds, user, newlyChecked);
    } else {
      await saveReading(user, updatedReadings, trueIdx);
    }

    // Publish the final medication quantities once, after both deductions.
    if (workingMeds !== medications) {
      dispatch({ type: 'SET_MEDICATIONS', payload: workingMeds });
    }

    await getReadings(user.id);
  }, [readings, editIdx, editDraft, pref, user, medications, dispatch, getReadings]);

  return {
    readings,
    getReadings,
    addReading,
    handleReadingChange,
    startEditingReading,
    stopEditingReading,
    cancelEditingReading,
    editDraft,
  };
}
