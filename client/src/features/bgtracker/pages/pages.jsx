import React, { useEffect } from 'react';
import { useAppContext }    from '../../../context/AppContext';
import { useBloodPressure } from '../hooks/useBloodPressure';
import { useWeights }       from '../hooks/useWeights';
import { useMedications }   from '../hooks/useMedications';
import { usePreferences }   from '../hooks/usePreferences';
import { useChartData }     from '../hooks/useChartData';
import TableOneBP     from '../components/Tables/TableOneBP';
import TableWeights   from '../components/Tables/TableWeights';
import TableMeds      from '../components/Tables/TableMeds';
import { BGChart, BPChart, A1CChart, WeightChart } from '../components/Charts';
import Preferences    from '../components/Preferences';
import Help           from '../components/Help';
import { MED_COLUMNS, WEIGHT_COLUMNS, bpColumnsFor } from '../components/Tables/buildColumns';

export function BloodPressurePage() {
  const { state } = useAppContext();
  const { A1C, editIdx, preference } = state;
  const { bloodpressures, getBloodPressures, addBP, handleBPChange, startEditingBP, stopEditingBP, cancelEditingBP, editDraft } = useBloodPressure();

  useEffect(() => {
    if (state.user.isLogedIn) getBloodPressures(state.user.id);
  }, [state.user.isLogedIn, state.user.id, getBloodPressures]);

  return (
    <TableOneBP add={addBP} A1C={A1C} editIdx={editIdx}
      bloodpressures={bloodpressures} header={bpColumnsFor(preference.timesPD)}
      handleChange={handleBPChange} startEditing={startEditingBP} stopEditing={stopEditingBP}
      cancelEditing={cancelEditingBP} editDraft={editDraft} />
  );
}

export function WeightPage() {
  const { state } = useAppContext();
  const { A1C, editIdx } = state;
  const { weights, getWeights, addWeight, handleWeightChange, startEditingWeight, stopEditingWeight, cancelEditingWeight, editDraft } = useWeights();

  useEffect(() => {
    if (state.user.isLogedIn) getWeights(state.user.id);
  }, [state.user.isLogedIn, state.user.id, getWeights]);

  return (
    <TableWeights add={addWeight} A1C={A1C} editIdx={editIdx}
      weights={weights} header={WEIGHT_COLUMNS}
      handleChange={handleWeightChange} startEditing={startEditingWeight} stopEditing={stopEditingWeight}
      cancelEditing={cancelEditingWeight} editDraft={editDraft} />
  );
}

export function MedicationsPage() {
  const { state } = useAppContext();
  const { A1C, editIdx } = state;
  const { medications, getMedications, addMedication, handleMedicationChange,
    startEditingMedication, stopEditingMedication, cancelEditingMedication,
    handleMedicationDelete, editDraft } = useMedications();

  useEffect(() => {
    if (state.user.isLogedIn) getMedications(state.user.id);
  }, [state.user.isLogedIn, state.user.id, getMedications]);

  return (
    <TableMeds add={addMedication} A1C={A1C} editIdx={editIdx}
      medications={medications} header={MED_COLUMNS}
      handleChange={handleMedicationChange} handleDelete={handleMedicationDelete}
      startEditing={startEditingMedication} stopEditing={stopEditingMedication}
      cancelEditing={cancelEditingMedication} editDraft={editDraft} />
  );
}

export function ChartsPage({ type }) {
  const { state } = useAppContext();
  const { getBloodPressures } = useBloodPressure();
  const { getWeights } = useWeights();

  // BP and weight rows are otherwise only loaded by their table pages, so a
  // chart opened first (or after a refresh) drew empty axes.
  useEffect(() => {
    if (!state.user.isLogedIn || !state.user.id) return;
    if (type === 'bp')     getBloodPressures(state.user.id);
    if (type === 'weight') getWeights(state.user.id);
  }, [type, state.user.isLogedIn, state.user.id, getBloodPressures, getWeights]);

  const {
    bgChartData, bpChartData, a1cChartData, a1cChartDataColaberated, a1cChartDataQuarterly,
    weightChartData, avgBloodPressure, avgWeight,
  } = useChartData();
  if (type === 'bg')  return <BGChart  chartData={bgChartData} />;
  if (type === 'bp')  return <BPChart  chartData={bpChartData} average={avgBloodPressure()} />;
  if (type === 'a1c') return <A1CChart chartData={a1cChartData} chartDataColaberated={a1cChartDataColaberated} chartDataQuarterly={a1cChartDataQuarterly} />;
  if (type === 'weight') return <WeightChart chartData={weightChartData} average={avgWeight()} />;
  return null;
}

export function PreferencesPage() {
  const { state } = useAppContext();
  const { preference } = state;
  const { handlePreference, handleEditPreferences, handleSavePreferences } = usePreferences();

  return (
    <Preferences userId={state.user.id} {...preference}
      handlePreference={handlePreference}
      handleEditPreferences={handleEditPreferences}
      handleSavePreferences={handleSavePreferences} />
  );
}

export function HelpPage() {
  return <Help />;
}
