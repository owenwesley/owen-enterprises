import { useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch } from '../../../utils/api';

// The DB driver hands DECIMAL columns back as strings ("0.0000"), so numeric
// preference fields are coerced to real numbers when they're loaded.
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The full set of values to save, exactly as the server expects them.
 * Options that don't apply to the chosen tracking mode are zeroed out (only
 * 3+ readings a day unlocks nutrition / weight / meds / insulin / sliding
 * scale). Flags are sent as real 0/1 numbers — they used to be sent as the
 * strings "0"/"1", and the server read "0" as true, so a checkbox could never
 * be switched off.
 */
function buildPayload(p) {
  const multi = p.timesPD > 2;
  const flag  = (v) => (multi && v ? 1 : 0);
  const scale = (v) => (multi && p.chkSlidingScale ? num(v) : 0);
  return {
    timesPD:         p.timesPD,
    chkNutrition:    flag(p.chkNutrition),
    chkWeight:       flag(p.chkWeight),
    height:          multi && p.chkWeight ? num(p.height) : 0,
    chkMeds:         flag(p.chkMeds),
    chkMedsB:        flag(p.chkMedsB),
    chkMedsL:        flag(p.chkMedsL),
    chkMedsD:        flag(p.chkMedsD),
    chkMedsBed:      flag(p.chkMedsBed),
    chkInsulin:      flag(p.chkInsulin),
    typInsulin:      multi && p.chkInsulin ? num(p.typInsulin) : 0,
    chkBP:           p.chkBP ? 1 : 0,
    chkSlidingScale: flag(p.chkSlidingScale),
    slidingScale1:   scale(p.slidingScale1),
    slidingScale2a:  scale(p.slidingScale2a),
    slidingScale2b:  scale(p.slidingScale2b),
    slidingScale3a:  scale(p.slidingScale3a),
    slidingScale3b:  scale(p.slidingScale3b),
    slidingScale4a:  scale(p.slidingScale4a),
    slidingScale4b:  scale(p.slidingScale4b),
    slidingScale5:   scale(p.slidingScale5),
    carbRatio:       scale(p.carbRatio),
  };
}

export function usePreferences() {
  const { state, dispatch } = useAppContext();
  const { user, preference } = state;

  const loadUserPreference = useCallback(async (user_id) => {
    // Fetch all preferences and find the one matching this user
    if (!user_id) return;
    const data = await getFetch(`/bgtracker/preferences/${user_id}`);
    const pref = data?.results;
    if (!pref) return;

    // Normalise 0/1 values from DB into booleans
    const boolOrNum = (val) => val === 1 ? true : val === 0 ? false : val;
    dispatch({
      type: 'SET_PREFERENCE',
      payload: {
        id: pref.id, user_id: pref.user_id,
        timesPD: num(pref.timesPD),
        chkNutrition:  boolOrNum(pref.chkNutrition),
        chkWeight:     boolOrNum(pref.chkWeight),
        height:        num(pref.height),
        chkMeds:       boolOrNum(pref.chkMeds),
        chkMedsB:      boolOrNum(pref.chkMedsB),
        chkMedsL:      boolOrNum(pref.chkMedsL),
        chkMedsD:      boolOrNum(pref.chkMedsD),
        chkMedsBed:    boolOrNum(pref.chkMedsBed),
        chkInsulin:    boolOrNum(pref.chkInsulin),
        typInsulin:    num(pref.typInsulin),
        chkBP:         boolOrNum(pref.chkBP),
        chkSlidingScale: boolOrNum(pref.chkSlidingScale),
        slidingScale1: num(pref.slidingScale1),   slidingScale2a: num(pref.slidingScale2a),
        slidingScale2b: num(pref.slidingScale2b), slidingScale3a: num(pref.slidingScale3a),
        slidingScale3b: num(pref.slidingScale3b), slidingScale4a: num(pref.slidingScale4a),
        slidingScale4b: num(pref.slidingScale4b), slidingScale5:  num(pref.slidingScale5),
        carbRatio: num(pref.carbRatio),
      },
    });
  }, [dispatch]);

  // Local field change (checkbox or select)
  const handlePreference = useCallback((e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
    dispatch({ type: 'SET_PREFERENCE', payload: { [e.target.name]: value } });
  }, [dispatch]);

  // Both buttons save the same complete set of values. The server keeps ONE
  // preferences row per user and updates it in place, so pressing Save twice
  // no longer creates a duplicate and a stale id can't turn the save into a
  // silent no-op. Reloading afterwards shows exactly what was stored (and
  // picks up the row's id).
  const savePreferences = useCallback(async (route) => {
    await postFetch(`/bgtracker/preferences/${route}/${user.id}`, {
      user_id: user.id,
      ...buildPayload(preference),
    }).catch(console.error);
    await loadUserPreference(user.id);
  }, [preference, user, loadUserPreference]);

  // Save edits to an existing preference record
  const handleEditPreferences = useCallback(() => savePreferences('edit'), [savePreferences]);

  // Save a brand-new preference record
  const handleSavePreferences = useCallback(() => savePreferences('add'), [savePreferences]);

  return { preference, loadUserPreference, handlePreference, handleEditPreferences, handleSavePreferences };
}
