import React, { useEffect } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { useReadings }   from '../hooks/useReadings';
import { useBloodPressure } from '../hooks/useBloodPressure';
import { useNutrition } from '../hooks/useNutrition';
import { buildColumns, bpColumnsFor } from '../components/Tables/buildColumns';
import BGTable           from '../components/Tables/BGTable';
import TableOneBP        from '../components/Tables/TableOneBP';
import Box              from '@mui/material/Box';
import { readingsPageSx } from '../components/Styles';
import { filterLastNDays, formatDate } from '../../../utils/dateFormat';
import { nutritionSlotsFor } from '../components/Tables/nutritionColumns';
import { caloriesByDate, calorieStatus, CALORIE_TINT } from '../utils/calorieGoal';

export default function ReadingsPage() {
  const { state } = useAppContext();
  const { user, preference, editIdx, A1C, bloodpressures } = state;
  const { chkBP, timesPD, chkNutrition } = preference;
  const calorieGoal = Number(preference.calorieGoal) || 0;
  const colourByCalories = Boolean(chkNutrition) && calorieGoal > 0 && timesPD > 2;

  const { readings, getReadings, addReading, handleReadingChange, startEditingReading, stopEditingReading, cancelEditingReading, editDraft } = useReadings();
  const { nutritions, getNutritions } = useNutrition();
  const { getBloodPressures, addBP, handleBPChange, startEditingBP, stopEditingBP, cancelEditingBP, editDraft: bpEditDraft } = useBloodPressure();

  useEffect(() => {
    if (user.isLogedIn) {
      getReadings(user.id);
      getBloodPressures(user.id);
    }
  }, [user.isLogedIn, user.id, getReadings, getBloodPressures]);

  // The calorie-goal row colours need each day's nutrition rows, which are otherwise
  // only loaded on the Nutrition page. Skip the request when there is no goal.
  useEffect(() => {
    if (user.isLogedIn && colourByCalories) getNutritions();
  }, [user.isLogedIn, colourByCalories, getNutritions]);

  if (chkBP && timesPD <= 2) {
    return (
      <Box sx={readingsPageSx(A1C)}>
        <TableOneBP
          add={addBP} A1C={A1C} editIdx={editIdx}
          bloodpressures={bloodpressures} header={bpColumnsFor(timesPD)}
          handleChange={handleBPChange}
          startEditing={startEditingBP} stopEditing={stopEditingBP}
          cancelEditing={cancelEditingBP} editDraft={bpEditDraft}
        />
      </Box>
    );
  }

  const { groups, columns } = buildColumns(preference);

  // Rule 1: the BG table displays ONLY the last 120 days. This is a display
  // filter — the full 10-year history stays in the database and continues to
  // feed the A1C / collaborated charts, which span longer windows on purpose.
  const last120DaysReadings = filterLastNDays(readings, 120);

  // Tint a reading row by how that day's calories compare with the goal.
  // No nutrition logged for the date (or no goal) means no colour.
  let rowTint;
  if (colourByCalories) {
    const byDate = caloriesByDate(nutritions, nutritionSlotsFor(timesPD));
    rowTint = (row) => CALORIE_TINT[calorieStatus(byDate.get(formatDate(row.date)), calorieGoal).band];
  }

  return (
    <Box sx={readingsPageSx(A1C)}>
      <BGTable
        rows={last120DaysReadings} groups={groups} columns={columns}
        editIdx={editIdx} onAdd={addReading}
        handleChange={handleReadingChange}
        startEditing={startEditingReading} stopEditing={stopEditingReading}
        cancelEditing={cancelEditingReading} editDraft={editDraft}
        A1C={A1C} rowTint={rowTint}
      />
    </Box>
  );
}
