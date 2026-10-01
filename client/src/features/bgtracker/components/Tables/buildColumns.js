/**
 * buildColumns(pref)
 *
 * Given the user's preference object, returns:
 *   groups   – array of meal-group objects used to render the two-row header
 *   columns  – flat array of { name, prop, type } used by Row.jsx for cell rendering
 *
 * This single function replaces the 50+ individual TableXxx.jsx files whose only
 * difference was which columns appeared.
 */

// Ordered meal slots. hasSF = true means this slot gets Slow+Fast when typInsulin===2
const SLOTS = [
  { key: 'B',   label: 'Breakfast', hasSF: true  },
  { key: 'L',   label: 'Lunch',     hasSF: false },
  { key: 'D',   label: 'Dinner',    hasSF: false },
  { key: 'BB',  label: 'Before Bed',hasSF: false },
  { key: 'Bed', label: 'Bedtime',   hasSF: true  },
];

// Which slots are active for each timesPD value
const SLOTS_FOR_TIMES = {
  1: ['B'],
  2: ['B', 'BB'],
  3: ['B', 'L', 'D'],
  4: ['B', 'L', 'D', 'BB'],
  5: ['B', 'L', 'D', 'BB', 'Bed'],
};

// Which pref flag enables meds for each slot
const MEDS_FLAG = { B: 'chkMedsB', L: 'chkMedsL', D: 'chkMedsD', Bed: 'chkMedsBed' };

export function buildColumns(pref) {
  const { timesPD = 1, chkMeds, chkInsulin, typInsulin } = pref;
  const activeKeys = SLOTS_FOR_TIMES[timesPD] || ['B'];
  const activeSlots = SLOTS.filter((s) => activeKeys.includes(s.key));

  const groups  = [];
  const columns = [{ name: 'Date', prop: 'date', type: 'date' }];

  for (const slot of activeSlots) {
    const slotCols = [];

    // Always: sugar + carbs
    slotCols.push({ name: 'Sugar', prop: `sugar${slot.key}`, type: 'number' });
    slotCols.push({ name: 'Carbs', prop: `carbs${slot.key}`, type: 'number' });

    // Insulin columns
    if (chkInsulin) {
      const useSF = typInsulin === 2 && slot.hasSF;
      if (useSF) {
        slotCols.push({ name: 'Slow', prop: `insulinS${slot.key}`, type: 'number' });
        slotCols.push({ name: 'Fast', prop: `insulinF${slot.key}`, type: 'number' });
      } else {
        // Slots that support a Slow/Fast split (Breakfast, Bedtime) write a
        // single-type dose into the Slow column instead of the old,
        // now-retired insulinB / insulinBed fields — one canonical field per
        // slot regardless of mode, rather than a 3rd column duplicating
        // insulinFB / insulinFBed. Slots with no split (Lunch, Dinner,
        // Before Bed) keep their own single field as before.
        const prop = slot.hasSF ? `insulinS${slot.key}` : `insulin${slot.key}`;
        slotCols.push({ name: 'Insulin', prop, type: 'number' });
      }
    }

    // Meds checkbox (only for slots that have a meds flag)
    const medsFlag = MEDS_FLAG[slot.key];
    if (chkMeds && medsFlag && pref[medsFlag]) {
      slotCols.push({ name: 'Meds', prop: `chkMeds${slot.key}`, type: 'checkbox' });
    }

    groups.push({ label: slot.label, cols: slotCols });
    columns.push(...slotCols);
  }

  return { groups, columns };
}

// BP header columns (static – used when chkBP is active)
export const BP_COLUMNS = [
  { name: 'Date',           prop: 'date', type: 'date'   },
  { name: 'SYS (Top BP)',   prop: 'hbp',  type: 'number' },
  { name: 'DIAS (Bot BP)',  prop: 'lbp',  type: 'number' },
  { name: 'HR',             prop: 'hr',   type: 'number' },
  { name: 'SYS (Top BP)',   prop: 'hbp2', type: 'number' },
  { name: 'DIAS (Bot BP)',  prop: 'lbp2', type: 'number' },
  { name: 'HR',             prop: 'hr2',  type: 'number' },
];

// Medication header columns (static)
export const MED_COLUMNS = [
  { name: 'Name',       prop: 'name',       type: 'text'   },
  { name: 'Dose',       prop: 'dose',       type: 'number' },
  { name: 'Unit',       prop: 'unit',       type: 'text'   },
  { name: 'Quantity',   prop: 'quantity',   type: 'number' },
  { name: 'Prescriber', prop: 'prescriber', type: 'text'   },
  { name: 'AM',         prop: 'am',         type: 'number' },
  { name: 'Noon',       prop: 'noon',       type: 'number' },
  { name: 'Evening',    prop: 'evening',    type: 'number' },
  { name: 'Bed',        prop: 'bed',        type: 'number' },
];

// Weight header columns (static)
export const WEIGHT_COLUMNS = [
  { name: 'Date', prop: 'date', type: 'date'   },
  { name: 'KG',   prop: 'kg',   type: 'number' },
  { name: 'LBS',  prop: 'lbs',  type: 'number' },
  { name: 'BMI',  prop: 'bmi',  type: 'number' },
];
