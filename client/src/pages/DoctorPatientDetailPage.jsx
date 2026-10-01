import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useHistory } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { getFetch } from '../utils/api';
import { BPChart, WeightChart } from '../features/bgtracker/components/Charts';
import { BPChartData, getLabels } from '../features/bgtracker/utils/chartData';

const sxStyles = {
  wrapper: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: { xs: '16px 12px', sm: '24px' },
    boxSizing: 'border-box',
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
  },
  card: {
    width: '100%',
    maxWidth: 800,
    my: 'auto',
    borderRadius: 4,
    padding: { xs: '18px 12px', sm: '26px' },
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  header: { fontWeight: 800, color: '#1a237e', fontSize: '1.3rem' },
  section: { fontWeight: 700, color: '#1a237e', fontSize: '1rem', mt: 1 },
  meta: { color: '#555', fontSize: '0.9rem' },
  notShared: { color: '#777', fontStyle: 'italic', fontSize: '0.9rem', textAlign: 'center', padding: '12px 0' },
};

// Same line-chart shape buildBPChart()/buildWeightChart() build in
// useChartData.js, just computed here from data fetched for a specific
// patient rather than from the signed-in user's own store. Kept as plain
// functions (not that hook) so viewing a patient never touches the doctor's
// own AppContext state.
function buildBPChartData(bloodpressures) {
  const last90 = bloodpressures.slice(-90);
  const { dataHBP, dataLBP, dataHR, dataHBP2, dataLBP2, dataHR2 } = BPChartData(last90);
  const mkLine = (label, r, g, b, data) => ({
    label, data, fill: false, lineTension: 0.1,
    backgroundColor: `rgba(${r},${g},${b},0.4)`,
    borderColor: `rgba(${r},${g},${b},1)`,
    pointBorderColor: `rgba(${r},${g},${b},1)`,
    pointBackgroundColor: '#fff', pointBorderWidth: 1,
    pointHoverRadius: 5, pointRadius: 1, pointHitRadius: 10,
  });
  return {
    labels: getLabels('bp', bloodpressures),
    datasets: [
      mkLine('First SYS', 255, 0, 0, dataHBP),
      mkLine('First DIAS', 0, 255, 0, dataLBP),
      mkLine('First Heart Rate', 0, 0, 255, dataHR),
      mkLine('Second SYS', 255, 0, 130, dataHBP2),
      mkLine('Second DIAS', 0, 255, 130, dataLBP2),
      mkLine('Second Heart Rate', 0, 130, 255, dataHR2),
    ],
  };
}

function buildWeightChartData(weights) {
  const last120 = weights.slice(-120);
  const mkLine = (label, r, g, b, data) => ({
    label, data, fill: false, lineTension: 0.1,
    backgroundColor: `rgba(${r},${g},${b},0.4)`,
    borderColor: `rgba(${r},${g},${b},1)`,
    pointBorderColor: `rgba(${r},${g},${b},1)`,
    pointBackgroundColor: '#fff', pointBorderWidth: 1,
    pointHoverRadius: 5, pointRadius: 2, pointHitRadius: 10,
  });
  return {
    labels: getLabels('120', weights),
    datasets: [
      mkLine('LBS', 255, 0, 0, last120.map((w) => Number(w.lbs) || 0)),
      mkLine('KG', 0, 0, 255, last120.map((w) => Number(w.kg) || 0)),
      mkLine('BMI', 0, 150, 0, last120.map((w) => Number(w.bmi) || 0)),
    ],
  };
}

const avgBP = (rows) => {
  if (!rows.length) return null;
  const sum = (f) => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);
  return `${Math.round(sum('hbp') / rows.length)}/${Math.round(sum('lbp') / rows.length)}/${Math.round(sum('hr') / rows.length)}`;
};
const avgWeight = (rows) => {
  if (!rows.length) return null;
  return (rows.reduce((s, r) => s + (Number(r.lbs) || 0), 0) / rows.length).toFixed(2);
};

export default function DoctorPatientDetailPage() {
  const { patientId } = useParams();
  const history = useHistory();
  const [patient, setPatient] = useState(null); // from the /doctor/patients list (name + sharing flags)
  const [weights, setWeights] = useState(null);
  const [bloodpressures, setBloodpressures] = useState(null);
  const [medications, setMedications] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getFetch('/doctor/patients');
      if (cancelled) return;
      if (!list || list.error) { setError((list && list.error) || 'Server unreachable'); return; }
      const found = list.results.find((p) => String(p.patient_id) === String(patientId));
      if (!found) { setError('This patient is not linked to you (or the link was revoked).'); return; }
      setPatient(found);

      if (found.shareWeight) {
        const w = await getFetch(`/doctor/patients/${patientId}/weights`);
        if (!cancelled) setWeights(w && !w.error ? w.results : []);
      } else if (!cancelled) setWeights([]);

      if (found.shareBP) {
        const b = await getFetch(`/doctor/patients/${patientId}/bloodpressures`);
        if (!cancelled) setBloodpressures(b && !b.error ? b.results : []);
      } else if (!cancelled) setBloodpressures([]);

      if (found.shareMedications) {
        const m = await getFetch(`/doctor/patients/${patientId}/medications`);
        if (!cancelled) setMedications(m && !m.error ? m.results : []);
      } else if (!cancelled) setMedications([]);
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  const bpChartData = useMemo(() => (bloodpressures ? buildBPChartData(bloodpressures) : null), [bloodpressures]);
  const weightChartData = useMemo(() => (weights ? buildWeightChartData(weights) : null), [weights]);

  return (
    <div style={sxStyles.wrapper}>
      <Paper sx={sxStyles.card} elevation={6}>
        <Box>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => history.push('/doctor')}>
            Back to patients
          </Button>
        </Box>

        {error && <Typography sx={{ color: '#b71c1c' }}>{error}</Typography>}

        {patient && (
          <>
            <Typography sx={sxStyles.header}>{patient.firstName} {patient.lastName}</Typography>
            <Typography sx={sxStyles.meta}>
              Read-only view — showing only what this patient has chosen to share with you.
            </Typography>

            <Typography sx={sxStyles.section}>Blood pressure</Typography>
            {patient.shareBP
              ? <BPChart chartData={bpChartData} average={bloodpressures && bloodpressures.length ? avgBP(bloodpressures) : null} />
              : <Typography sx={sxStyles.notShared}>Not shared by this patient.</Typography>}

            <Typography sx={sxStyles.section}>Weight</Typography>
            {patient.shareWeight
              ? <WeightChart chartData={weightChartData} average={weights && weights.length ? avgWeight(weights) : null} />
              : <Typography sx={sxStyles.notShared}>Not shared by this patient.</Typography>}

            <Typography sx={sxStyles.section}>Medications</Typography>
            {!patient.shareMedications ? (
              <Typography sx={sxStyles.notShared}>Not shared by this patient.</Typography>
            ) : medications && medications.length > 0 ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell><TableCell>Dose</TableCell>
                      <TableCell>Prescriber</TableCell><TableCell>Schedule</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {medications.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.name}</TableCell>
                        <TableCell>{m.dose} {m.unit}</TableCell>
                        <TableCell>{m.prescriber}</TableCell>
                        <TableCell>
                          {[m.am && 'AM', m.noon && 'Noon', m.evening && 'Evening', m.bed && 'Bed'].filter(Boolean).join(', ') || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography sx={sxStyles.meta}>No medications on record.</Typography>
            )}
          </>
        )}
      </Paper>
    </div>
  );
}
