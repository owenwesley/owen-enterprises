import { postFetch } from '../../../utils/api';

/**
 * When a reading is saved with a meds checkbox that JUST transitioned from
 * unchecked to checked, deduct the scheduled AM / noon / evening / bed doses
 * from each medication's quantity and persist.
 *
 * `newlyChecked` ({ B, L, D, Bed }) flags only the meal slots that changed
 * on THIS edit — see useReadings.js's stopEditingReading, which computes it
 * by comparing the pre-edit row to the merged draft. Only those slots'
 * doses are deducted.
 *
 * Fix: this previously deducted based on the raw checkbox state on every
 * save, with no way to tell a fresh checkbox from one left checked from a
 * prior save — so re-saving a reading (e.g. to fix an unrelated sugar
 * value) deducted the same scheduled dose again each time. It also called
 * POST /readings/edit once per medication in the list with an identical
 * payload each time; the reading is now saved exactly once, after the
 * deduction loop.
 */
export async function deductMeds(readings, editIdx, medications, user, newlyChecked = {}) {
  const row = readings[editIdx];
  const meds = [...medications];

  for (let i = 0; i < meds.length; i++) {
    let deduction = 0;
    if (newlyChecked.B)   deduction += parseInt(meds[i].am      || 0, 10);
    if (newlyChecked.L)   deduction += parseInt(meds[i].noon    || 0, 10);
    if (newlyChecked.D)   deduction += parseInt(meds[i].evening || 0, 10);
    if (newlyChecked.Bed) deduction += parseInt(meds[i].bed     || 0, 10);

    if (deduction === 0) continue; // nothing changed for this medication — skip the write

    meds[i] = { ...meds[i], quantity: meds[i].quantity - deduction };

    await postFetch(`/bgtracker/medications/edit/${user.id}`, {
      id:         meds[i].id,
      user_id:    user.id,
      name:       meds[i].name,
      dose:       meds[i].dose,
      unit:       meds[i].unit,
      quantity:   meds[i].quantity,
      prescriber: meds[i].prescriber,
      am:         meds[i].am,
      noon:       meds[i].noon,
      evening:    meds[i].evening,
      bed:        meds[i].bed,
    }).catch(console.error);
  }

  // Save the reading exactly once, regardless of how many medications (if
  // any) were touched above.
  await postFetch(`/bgtracker/readings/edit/${user.id}`, {
    id:           row.id,
    user_id:      user.id,
    date:         row.date,
    sugarB:       row.sugarB,    carbsB:  row.carbsB,
    insulinSB:    row.insulinSB, insulinFB: row.insulinFB,
    chkMedsB:     row.chkMedsB,
    sugarL:       row.sugarL,    carbsL:  row.carbsL,  insulinL:  row.insulinL,
    chkMedsL:     row.chkMedsL,
    sugarD:       row.sugarD,    carbsD:  row.carbsD,  insulinD:  row.insulinD,
    chkMedsD:     row.chkMedsD,
    sugarBB:      row.sugarBB,   carbsBB: row.carbsBB, insulinBB: row.insulinBB,
    sugarBed:     row.sugarBed,  carbsBed: row.carbsBed,
    insulinSBed:  row.insulinSBed, insulinFBed: row.insulinFBed,
    chkMedsBed:   row.chkMedsBed,
  }).catch(console.error);

  return meds;
}
