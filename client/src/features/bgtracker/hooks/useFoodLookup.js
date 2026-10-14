import { useEffect, useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getQuiet, postFetch } from '../../../utils/api';

// "What I ate" (1.13.6). Server side: routes/bgtracker/foods.js. The food lookup is only offered when the
// server has a fatsecret key, so the page asks once per person.
const enabledFor = {};   // user id -> true / false, remembered for the browser session

/** true when this site has the food database switched on (and the person uses Nutrition at 3+ readings a day). */
export function useFoodEnabled() {
  const { state } = useAppContext();
  const { user, preference } = state;
  const wanted = Boolean(user.isLogedIn && user.id && preference.chkNutrition && Number(preference.timesPD) >= 3);
  const [enabled, setEnabled] = useState(wanted && enabledFor[user.id] === true);

  useEffect(() => {
    if (!wanted) { setEnabled(false); return undefined; }
    if (enabledFor[user.id] !== undefined) { setEnabled(enabledFor[user.id]); return undefined; }
    let live = true;
    getQuiet(`/bgtracker/foods/enabled/${user.id}`).then((d) => {
      enabledFor[user.id] = Boolean(d && d.enabled);
      if (live) setEnabled(enabledFor[user.id]);
    });
    return () => { live = false; };
  }, [wanted, user.id]);

  return enabled;
}

/** Look up a typed meal. Resolves { items, totals } or null when the server refused (the error toast already showed). */
export async function lookupFood(userId, text) {
  const d = await postFetch(`/bgtracker/foods/lookup/${userId}`, { text });
  return d && !d.error && Array.isArray(d.items) ? d : null;
}

/** One chosen food at the typed amount -> item or null. */
export async function pickFood(userId, food_id, qty, unit) {
  const d = await postFetch(`/bgtracker/foods/pick/${userId}`, { food_id, qty, unit });
  return d && !d.error && d.item ? d.item : null;
}

/** Writes a confirmed meal into the day's Nutrition row (called when the reading row is saved). */
export function applyFood(userId, body) {
  return postFetch(`/bgtracker/foods/apply/${userId}`, body);
}
