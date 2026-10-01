/**
 * Calculates fast-acting insulin units for a given sugar + carbs reading
 * using the 5-tier sliding scale from user preferences.
 *
 * Returns the number of insulin units to recommend.
 */
export function calcSlidingScale(sugar, carbs, pref) {
  const {
    slidingScale1,
    slidingScale2a, slidingScale2b,
    slidingScale3a, slidingScale3b,
    slidingScale4a, slidingScale4b,
    slidingScale5,
    carbRatio,
  } = pref;

  if (!carbRatio) return 0;

  let bonus = 0;

  if (sugar >= slidingScale5)                           bonus = 8;
  else if (sugar >= slidingScale4a && sugar <= slidingScale4b) bonus = 6;
  else if (sugar >= slidingScale3a && sugar <= slidingScale3b) bonus = 4;
  else if (sugar >= slidingScale2a && sugar <= slidingScale2b) bonus = 2;
  else if (sugar >= 1 && sugar <= slidingScale1)        bonus = 0;
  else                                                  return 0; // sugar === 0

  let carbUnits = 0;
  if (carbs >= parseInt(carbRatio)) {
    carbUnits = parseInt(carbs / carbRatio);
    const remainder = carbs % carbRatio;
    if (remainder > 0) carbUnits += 1;
  } else if (carbs >= 1) {
    carbUnits = 1;
  }

  return carbUnits + bonus;
}
