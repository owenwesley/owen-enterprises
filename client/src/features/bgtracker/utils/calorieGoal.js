/**
 * Daily calorie goal helpers, shared by the Nutrition table and the BG table.
 *
 * A day's calories are compared with the goal saved in Preferences
 * (`calorieGoal`, 0 = no goal) and land in one of four bands:
 *
 *   none  no goal set, or nothing logged for the day   -> no colour
 *   under below NEAR_AT of the goal                    -> green
 *   near  from NEAR_AT of the goal up to the goal      -> yellow
 *   over  above the goal                               -> red
 *
 * Change NEAR_AT, the tints or the labels here and both tables follow.
 */
import { formatDate } from '../../../utils/dateFormat';
import { dailyTotal } from '../hooks/useNutrition';

export const NEAR_AT = 0.9;   // 90% of the goal counts as "close"

export const CALORIE_TINT = { under: '#e8f5e9', near: '#fff8e1', over: '#ffebee' };
export const CALORIE_TEXT = { under: '#1b5e20', near: '#8a6100', over: '#b71c1c' };

/** { band, left } for a day's calorie total against the goal. */
export function calorieStatus(total, goal) {
  const g = Number(goal) || 0;
  const t = Number(total) || 0;
  if (g <= 0) return { band: 'none', left: 0 };
  const left = Math.round(g - t);
  if (t <= 0) return { band: 'none', left };
  if (t > g) return { band: 'over', left };
  if (t >= g * NEAR_AT) return { band: 'near', left };
  return { band: 'under', left };
}

/** "450 left" or "120 over". */
export function caloriesLeftLabel(left) {
  return left >= 0 ? `${left} left` : `${Math.abs(left)} over`;
}

/**
 * Map of formatted date -> total calories for the meal slots on screen.
 * (If a date somehow has more than one nutrition row, they are added up.)
 */
export function caloriesByDate(nutritions = [], slots) {
  const byDate = new Map();
  for (const row of nutritions) {
    const key = formatDate(row.date);
    byDate.set(key, (byDate.get(key) || 0) + dailyTotal(row, 'calories', slots));
  }
  return byDate;
}
