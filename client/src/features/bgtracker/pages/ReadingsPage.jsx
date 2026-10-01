import React, { useEffect } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { useReadings }   from '../hooks/useReadings';
import { useBloodPressure } from '../hooks/useBloodPressure';
import { buildColumns }  from '../components/Tables/buildColumns';
import BGTable           from '../components/Tables/BGTable';
import TableOneBP        from '../components/Tables/TableOneBP';
import Box              from '@mui/material/Box';
import { readingsPageSx } from '../components/Styles';
import { filterLastNDays } from '../../../utils/dateFormat';

const BP_HEADER = [
  { name: 'Date',           prop: 'date', type: 'date'   },
  { name: 'SYS (Top BP)',   prop: 'hbp',  type: 'number' },
  { name: 'DIAS (Bot BP)',  prop: 'lbp',  type: 'number' },
  { name: 'HR',             prop: 'hr',   type: 'number' },
  { name: 'SYS (Top BP)',   prop: 'hbp2', type: 'number' },
  { name: 'DIAS (Bot BP)',  prop: 'lbp2', type: 'number' },
  { name: 'HR',             prop: 'hr2',  type: 'number' },
];

export default function ReadingsPage() {
  const { state } = useAppContext();
  const { user, preference, editIdx, A1C, bloodpressures } = state;
  const { chkBP, timesPD } = preference;

  const { readings, getReadings, addReading, handleReadingChange, startEditingReading, stopEditingReading, cancelEditingReading, editDraft } = useReadings();
  const { getBloodPressures, addBP, handleBPChange, startEditingBP, stopEditingBP, cancelEditingBP, editDraft: bpEditDraft } = useBloodPressure();

  useEffect(() => {
    if (user.isLogedIn) {
      getReadings(user.id);
      getBloodPressures(user.id);
    }
  }, [user.isLogedIn, user.id, getReadings, getBloodPressures]);

  if (chkBP && timesPD <= 2) {
    return (
      <Box sx={readingsPageSx(A1C)}>
        <TableOneBP
          add={addBP} A1C={A1C} editIdx={editIdx}
          bloodpressures={bloodpressures} header={BP_HEADER}
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

  return (
    <Box sx={readingsPageSx(A1C)}>
      <BGTable
        rows={last120DaysReadings} groups={groups} columns={columns}
        editIdx={editIdx} onAdd={addReading}
        handleChange={handleReadingChange}
        startEditing={startEditingReading} stopEditing={stopEditingReading}
        cancelEditing={cancelEditingReading} editDraft={editDraft}
        A1C={A1C}
      />
    </Box>
  );
}
