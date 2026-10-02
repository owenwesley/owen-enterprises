/**
 * Header definition for the Nutrition table.
 *
 * Mirrors the headers the older class-based NavBar used for /nutrition:
 *   timesPD 3 -> Breakfast, Lunch, Dinner
 *   timesPD 4 -> Breakfast, Lunch, Dinner, Bedtime
 *   timesPD 5 -> Breakfast, Lunch, Dinner, Before Bed, Bedtime
 * Every meal slot carries the same 18 nutrient columns (food name, calories,
 * fats, cholesterol, sodium, carbs, fiber, sugars, protein, vitamins, minerals).
 *
 * Nutrition is only offered at 3+ readings a day (see usePreferences), so any
 * other value falls back to the 3-meal layout.
 */

// Meal slots, in table order. `key` is the column-name suffix in the database
// (foodNameB, caloriesL, proteinBed ...).
export const NUTRITION_SLOTS = [
  { key: 'B',   label: 'Breakfast'  },
  { key: 'L',   label: 'Lunch'      },
  { key: 'D',   label: 'Dinner'     },
  { key: 'BB',  label: 'Before Bed' },
  { key: 'Bed', label: 'Bedtime'    },
];

const SLOTS_FOR_TIMES = {
  3: ['B', 'L', 'D'],
  4: ['B', 'L', 'D', 'Bed'],
  5: ['B', 'L', 'D', 'BB', 'Bed'],
};

// The 18 nutrient columns of one meal slot: `key` + slot suffix = DB column.
export const NUTRIENT_HEADERS = [
  { key: 'foodName',        name: 'Food Name',            type: 'text'   },
  { key: 'calories',        name: 'Calories',             type: 'number' },
  { key: 'saturated',       name: 'Saturated (g)',        type: 'number' },
  { key: 'trans',           name: 'Trans (g)',            type: 'number' },
  { key: 'polyunsaturated', name: 'Polyunsaturated (g)',  type: 'number' },
  { key: 'monosaturated',   name: 'Monosaturated (g)',    type: 'number' },
  { key: 'cholesterol',     name: 'Cholesterol (mg)',     type: 'number' },
  { key: 'sodium',          name: 'Sodium (mg)',          type: 'number' },
  { key: 'carbs',           name: 'Carbs (g)',            type: 'number' },
  { key: 'fiber',           name: 'Fiber (g)',            type: 'number' },
  { key: 'sugars',          name: 'Sugars (g)',           type: 'number' },
  { key: 'protein',         name: 'Protein (g)',          type: 'number' },
  { key: 'vitaminA',        name: 'A (mcg)',              type: 'number' },
  { key: 'vitaminC',        name: 'C (mcg)',              type: 'number' },
  { key: 'vitaminD',        name: 'D (mcg)',              type: 'number' },
  { key: 'calcium',         name: 'Calcium (mg)',         type: 'number' },
  { key: 'iron',            name: 'Iron (mg)',            type: 'number' },
  { key: 'potassium',       name: 'Potassium (mg)',       type: 'number' },
];

// Display name (with unit) for a nutrient key, e.g. 'sodium' -> 'Sodium (mg)'.
export const NUTRIENT_NAME = Object.fromEntries(NUTRIENT_HEADERS.map((h) => [h.key, h.name]));

// The meal slots shown for a timesPD value, in table order.
export function nutritionSlotsFor(timesPD) {
  const keys = SLOTS_FOR_TIMES[Number(timesPD)] || SLOTS_FOR_TIMES[3];
  return NUTRITION_SLOTS.filter((s) => keys.includes(s.key));
}

/**
 * buildNutritionColumns(timesPD)
 *   slots   – the active meal slots ({ key, label })
 *   groups  – [{ key, label, span }] for the top header row (one per meal)
 *   columns – flat [{ name, prop, type, slot }] for the second header row and
 *             the body cells, e.g. { name: 'Sodium (mg)', prop: 'sodiumL', ... }
 */
export function buildNutritionColumns(timesPD) {
  const slots = nutritionSlotsFor(timesPD);
  const groups = [];
  const columns = [];
  for (const slot of slots) {
    groups.push({ key: slot.key, label: slot.label, span: NUTRIENT_HEADERS.length });
    for (const h of NUTRIENT_HEADERS) {
      columns.push({ name: h.name, prop: `${h.key}${slot.key}`, type: h.type, slot: slot.key });
    }
  }
  return { slots, groups, columns };
}
