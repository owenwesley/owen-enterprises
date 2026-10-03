import { useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import {
  BGChartData, BPChartData,
  avgTimes, backgroundColor, borderColor,
  borderdataTimes, colaberated, colordataTimes, dataTimes,
  getLabels, quarterly,
} from '../utils/chartData';
import { formatDate } from '../../../utils/dateFormat';

export function useChartData() {
  const { state, dispatch } = useAppContext();
  const { readings, bloodpressures, weights, rate } = state;
  const { timesPD } = state.preference;

  // ── average BG + A1C ───────────────────────────────────────────────────────
  // Fix: previously divided by a hardcoded 120 regardless of how many
  // readings actually existed. Now divides by the real count.
  const findAvg = useCallback(() => {
    if (!readings || readings.length === 0) return;
    const fields = ['sugarB', 'sugarL', 'sugarD', 'sugarBB', 'sugarBed'];
    const total  = fields.reduce(
      (acc, f) => acc + readings.reduce((s, r) => s + parseInt(r[f] || 0, 10), 0), 0
    );
    const avg = total / ((timesPD || 1) * (readings.length || 1));
    dispatch({ type: 'SET_AVERAGES', payload: { avg, a1c: avg * rate } });
  }, [readings, timesPD, rate, dispatch]);

  // ── colaberated A1C chart (bar, 1/7/14/30/60/90/120 day windows) ──────────
  const buildA1CColaberated = useCallback(() => {
    if (!readings || readings.length === 0) return;
    const {
      totalTimes, Day1, totalTimes7, Day7, totalTimes14, Day14,
      totalTimes30, Day30, totalTimes60, Day60, totalTimes90, Day90,
      totalTimes120, Day120,
    } = colaberated(readings, timesPD, rate);

    const mkDataset = (label, total, days, DayArr) => {
      const avg = total / ((timesPD || 1) * days);
      const a1c = (avg * rate).toFixed(2);
      return { label, avg: avg.toFixed(2), a1c,
        backgroundColor: backgroundColor(a1c), borderColor: borderColor(a1c), data: DayArr };
    };

    dispatch({
      type: 'SET_A1C_COLABERATED',
      payload: {
        labels: getLabels('a1c'),
        datasets: [
          mkDataset('Day 1',   totalTimes,   1,   Day1),
          mkDataset('Day 7',   totalTimes7,  7,   Day7),
          mkDataset('Day 14',  totalTimes14, 14,  Day14),
          mkDataset('Day 30',  totalTimes30, 30,  Day30),
          mkDataset('Day 60',  totalTimes60, 60,  Day60),
          mkDataset('Day 90',  totalTimes90, 90,  Day90),
          mkDataset('Day 120', totalTimes120,120, Day120),
        ],
      },
    });
  }, [readings, timesPD, rate, dispatch]);

  // ── quarterly A1C bar chart ─────────────────────────────────────────────────
  // Longer-range companion to the 120-day chart: one bar per calendar
  // quarter that has any readings (grouped by real date, not a rolling
  // window), colour-coded by A1C range the same way the other bars are.
  const buildA1CQuarterly = useCallback(() => {
    if (!readings || readings.length === 0) return;
    const buckets = quarterly(readings, timesPD, rate);
    dispatch({
      type: 'SET_A1C_QUARTERLY',
      payload: {
        labels: buckets.map((b) => b.label),
        datasets: [{
          label: 'A1C by Quarter',
          backgroundColor: buckets.map((b) => backgroundColor(b.a1c)),
          borderColor:     buckets.map((b) => borderColor(b.a1c)),
          data:            buckets.map((b) => b.a1c),
          avg:             buckets.map((b) => b.avg),
        }],
      },
    });
  }, [readings, timesPD, rate, dispatch]);

  // ── 120-day A1C line chart ─────────────────────────────────────────────────
  // Fix: labels and data are now both derived from the SAME last-120 slice
  // of readings, via getLabels('120', readings) — previously labels came
  // from a static ['1'..'120'] array while data came from the full,
  // unsliced readings array, causing a misalignment whenever
  // readings.length !== 120 (which is the normal case).
  const buildA1CChart = useCallback(() => {
    if (!readings) return;
    const last120 = readings.slice(-120);
    dispatch({
      type: 'SET_A1C_CHART',
      payload: {
        labels: getLabels('120', readings),
        datasets: [{
          label: 'A1C',
          backgroundColor: colordataTimes(last120, rate, timesPD),
          borderColor:     borderdataTimes(last120, rate, timesPD),
          data:            dataTimes(last120, rate, timesPD),
          avg:             avgTimes(last120, timesPD),
          // Real calendar dates (MM-DD-YY), same index alignment as `data` —
          // used by the tooltip title callback to show "Day 120-09/12"
          // instead of just the bare position number.
          dates:           last120.map((r) => formatDate(r.date)),
        }],
      },
    });
  }, [readings, rate, timesPD, dispatch]);

  // ── BG line chart ──────────────────────────────────────────────────────────
  // Same fix: labels and data both derived from the same last-120 slice.
  const buildBGChart = useCallback(() => {
    if (!readings) return;
    const last120 = readings.slice(-120);
    const dates = last120.map((r) => formatDate(r.date));
    const { dataSB, dataSL, dataSD, dataSBB, dataSBed } = BGChartData(last120);
    const mkLine = (label, r, g, b, data) => ({
      label, data, dates, fill: false, lineTension: 0.1,
      backgroundColor: `rgba(${r},${g},${b},0.4)`,
      borderColor:     `rgba(${r},${g},${b},1)`,
      pointBorderColor: `rgba(${r},${g},${b},1)`,
      pointBackgroundColor: '#fff', pointBorderWidth: 1,
      pointHoverRadius: 5, pointRadius: 1, pointHitRadius: 10,
    });
    dispatch({
      type: 'SET_BG_CHART',
      payload: {
        labels: getLabels('120', readings),
        datasets: [
          mkLine('Breakfast',   255, 0,   0,   dataSB),
          mkLine('Lunch',       0,   255, 0,   dataSL),
          mkLine('Dinner',      0,   0,   255, dataSD),
          mkLine('Before Bed',  255, 255, 0,   dataSBB),
          mkLine('Bed',         0,   255, 255, dataSBed),
        ],
      },
    });
  }, [readings, dispatch]);

  // ── BP line chart ──────────────────────────────────────────────────────────
  // Same fix: labels and data both derived from the same last-90 slice.
  const buildBPChart = useCallback(() => {
    if (!bloodpressures) return;
    const last90 = bloodpressures.slice(-90);
    const dates = last90.map((b) => formatDate(b.date));
    const { dataHBP, dataLBP, dataHR, dataHBP2, dataLBP2, dataHR2 } = BPChartData(last90);
    const mkLine = (label, r, g, b, data) => ({
      label, data, dates, fill: false, lineTension: 0.1,
      backgroundColor: `rgba(${r},${g},${b},0.4)`,
      borderColor:     `rgba(${r},${g},${b},1)`,
      pointBorderColor: `rgba(${r},${g},${b},1)`,
      pointBackgroundColor: '#fff', pointBorderWidth: 1,
      pointHoverRadius: 5, pointRadius: 1, pointHitRadius: 10,
    });
    dispatch({
      type: 'SET_BP_CHART',
      payload: {
        labels: getLabels('bp', bloodpressures),
        datasets: [
          mkLine('First SYS',          255, 0,   0,   dataHBP),
          mkLine('First DIAS',         0,   255, 0,   dataLBP),
          mkLine('First Heart Rate',   0,   0,   255, dataHR),
          mkLine('Second SYS',         255, 0,   130, dataHBP2),
          mkLine('Second DIAS',        0,   255, 130, dataLBP2),
          mkLine('Second Heart Rate',  0,   130, 255, dataHR2),
        ],
      },
    });
  }, [bloodpressures, dispatch]);

  // ── Weight line chart (LBS / KG / BMI) ─────────────────────────────────────
  const buildWeightChart = useCallback(() => {
    if (!weights) return;
    const last90 = weights.slice(-90);
    const dates = last90.map((w) => formatDate(w.date));
    const mkLine = (label, r, g, b, data) => ({
      label, data, dates, fill: false, lineTension: 0.1,
      backgroundColor: `rgba(${r},${g},${b},0.4)`,
      borderColor:     `rgba(${r},${g},${b},1)`,
      pointBorderColor: `rgba(${r},${g},${b},1)`,
      pointBackgroundColor: '#fff', pointBorderWidth: 1,
      pointHoverRadius: 5, pointRadius: 2, pointHitRadius: 10,
    });
    dispatch({
      type: 'SET_WEIGHT_CHART',
      payload: {
        labels: getLabels('weight', weights),
        datasets: [
          mkLine('LBS', 255, 0,   0,   last90.map((w) => Number(w.lbs) || 0)),
          mkLine('KG',  0,   0,   255, last90.map((w) => Number(w.kg)  || 0)),
          mkLine('BMI', 0,   150, 0,   last90.map((w) => Number(w.bmi) || 0)),
        ],
      },
    });
  }, [weights, dispatch]);

  // ── header averages (rendered above their charts, not inside them) ─────────
  // Average blood pressure across all recorded readings, shown as
  // "Average Blood Pressure: 120/80/80" (SYS/DIAS/HR). Both the first and
  // second daily readings are pooled so the average reflects every
  // measurement actually taken.
  const avgBloodPressure = useCallback(() => {
    if (!bloodpressures || bloodpressures.length === 0) return null;
    let sys = 0, dia = 0, hr = 0, count = 0;
    bloodpressures.forEach((b) => {
      [['hbp', 'lbp', 'hr'], ['hbp2', 'lbp2', 'hr2']].forEach(([s, d, h]) => {
        const sv = Number(b[s]) || 0;
        const dv = Number(b[d]) || 0;
        const hv = Number(b[h]) || 0;
        if (sv || dv || hv) { sys += sv; dia += dv; hr += hv; count += 1; }
      });
    });
    if (!count) return null;
    return `${Math.round(sys / count)}/${Math.round(dia / count)}/${Math.round(hr / count)}`;
  }, [bloodpressures]);

  // Average weight in LBS, shown as "Average Weight: 220.00 LBS"
  const avgWeight = useCallback(() => {
    if (!weights || weights.length === 0) return null;
    const vals = weights.map((w) => Number(w.lbs) || 0).filter((v) => v > 0);
    if (!vals.length) return null;
    return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2);
  }, [weights]);

  // ── rebuild all charts at once ─────────────────────────────────────────────
  const rebuildAllCharts = useCallback(() => {
    findAvg();
    buildA1CColaberated();
    buildA1CQuarterly();
    buildA1CChart();
    buildBGChart();
    buildBPChart();
    buildWeightChart();
  }, [findAvg, buildA1CColaberated, buildA1CQuarterly, buildA1CChart, buildBGChart, buildBPChart, buildWeightChart]);

  return {
    findAvg, buildA1CColaberated, buildA1CQuarterly, buildA1CChart, buildBGChart, buildBPChart,
    buildWeightChart, rebuildAllCharts,
    avgBloodPressure, avgWeight,
    bgChartData:  state.bgChartData,
    bpChartData:  state.bpChartData,
    a1cChartData: state.a1cChartData,
    a1cChartDataColaberated: state.a1cChartDataColaberated,
    a1cChartDataQuarterly: state.a1cChartDataQuarterly,
    weightChartData: state.weightChartData,
  };
}
