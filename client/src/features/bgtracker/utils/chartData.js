// ── chart colour helpers ───────────────────────────────────────────────────────
import { parseStoredDate } from '../../../utils/dateFormat';

export const backgroundColor = (A1C) => {
  const v = Number(A1C);
  if (v >= 1.0 && v <= 5.6)  return 'rgba(0,0,255,0.6)';
  if (v >  5.6 && v <= 6.5)  return 'rgba(255,255,0,0.6)';
  if (v >  6.5 && v <= 7.5)  return 'rgba(0,255,0,0.6)';
  if (v >  7.5 && v <= 8.5)  return 'rgba(255,165,0,0.6)';
  if (v >  8.5)               return 'rgba(255,0,0,0.6)';
  return 'rgba(0,0,0,0.6)';
};

export const borderColor = (A1C) => {
  const v = Number(A1C);
  if (v >= 1.0 && v <= 5.6)  return 'rgba(0,0,255,1)';
  if (v >  5.6 && v <= 6.5)  return 'rgba(255,255,0,1)';
  if (v >  6.5 && v <= 7.5)  return 'rgba(0,255,0,1)';
  if (v >  7.5 && v <= 8.5)  return 'rgba(255,165,0,1)';
  if (v >  8.5)               return 'rgba(255,0,0,1)';
  return 'rgba(0,0,0,1)';
};

// ── BG / BP data extractors ───────────────────────────────────────────────────
export const BGChartData = (readings) => ({
  dataSB:   readings.map((r) => Number(r.sugarB)   || 0),
  dataSL:   readings.map((r) => Number(r.sugarL)   || 0),
  dataSD:   readings.map((r) => Number(r.sugarD)   || 0),
  dataSBB:  readings.map((r) => Number(r.sugarBB)  || 0),
  dataSBed: readings.map((r) => Number(r.sugarBed) || 0),
});

export const BPChartData = (bps) => ({
  dataHBP:  bps.map((r) => Number(r.hbp)  || 0),
  dataLBP:  bps.map((r) => Number(r.lbp)  || 0),
  dataHR:   bps.map((r) => Number(r.hr)   || 0),
  dataHBP2: bps.map((r) => Number(r.hbp2) || 0),
  dataLBP2: bps.map((r) => Number(r.lbp2) || 0),
  dataHR2:  bps.map((r) => Number(r.hr2)  || 0),
});

// ── sugar sum helper ──────────────────────────────────────────────────────────
const rowSugar = (r) =>
  (Number(r.sugarB) || 0) + (Number(r.sugarL) || 0) + (Number(r.sugarD) || 0) +
  (Number(r.sugarBB) || 0) + (Number(r.sugarBed) || 0);

// ── per-reading daily average ─────────────────────────────────────────────────
export const avgTimes = (readings, timesPD) => {
  const divisor = timesPD || 1;                          // Bug 2 fix: never divide by 0
  return readings.map((r) =>
    parseFloat((rowSugar(r) / divisor).toFixed(2))
  );
};

// ── per-reading A1C values ────────────────────────────────────────────────────
export const dataTimes = (readings, rate, timesPD) => {
  const divisor = timesPD || 1;                          // Bug 2 fix: never divide by 0
  return readings.map((r) =>
    parseFloat(((rate * rowSugar(r)) / divisor).toFixed(2))
  );
};

// per-reading colour arrays for the 120-day chart
export const colordataTimes = (readings, rate, timesPD) => {
  const divisor = timesPD || 1;
  return readings.map((r) =>
    backgroundColor((rate * rowSugar(r)) / divisor)
  );
};

export const borderdataTimes = (readings, rate, timesPD) => {
  const divisor = timesPD || 1;
  return readings.map((r) =>
    borderColor((rate * rowSugar(r)) / divisor)
  );
};

// ── colaberated rolling-window totals ─────────────────────────────────────────
const sugarSum   = (rows) => rows.reduce((s, r) => s + rowSugar(r), 0);
const windowSlice = (readings, days) =>
  readings.slice(Math.max(0, readings.length - days));

export const colaberated = (readings, timesPD, rate) => {
  const divisor = timesPD || 1;

  const totalTimes    = sugarSum(windowSlice(readings, 1));
  const totalTimes7   = sugarSum(windowSlice(readings, 7));
  const totalTimes14  = sugarSum(windowSlice(readings, 14));
  const totalTimes30  = sugarSum(windowSlice(readings, 30));
  const totalTimes60  = sugarSum(windowSlice(readings, 60));
  const totalTimes90  = sugarSum(windowSlice(readings, 90));
  const totalTimes120 = sugarSum(windowSlice(readings, 120));

  // Bug 5 fix: return [singleValue] not readings.map(() => value)
  // A1CLabels has 1 entry so only index 0 is plotted — return exactly 1 value.
  const mkDay = (total, days) => [
    parseFloat(((total / (divisor * days)) * rate).toFixed(2))
  ];

  return {
    totalTimes,    Day1:   mkDay(totalTimes,   1),
    totalTimes7,   Day7:   mkDay(totalTimes7,  7),
    totalTimes14,  Day14:  mkDay(totalTimes14, 14),
    totalTimes30,  Day30:  mkDay(totalTimes30, 30),
    totalTimes60,  Day60:  mkDay(totalTimes60, 60),
    totalTimes90,  Day90:  mkDay(totalTimes90, 90),
    totalTimes120, Day120: mkDay(totalTimes120,120),
  };
};

// ── quarterly A1C buckets ──────────────────────────────────────────────────────
// Groups readings by real calendar quarter (Q1: Jan-Mar ... Q4: Oct-Dec),
// using each reading's actual date rather than a fixed rolling window like
// `colaberated` above. Averages every reading recorded in that quarter, so
// this gives a longer-range, quarter-over-quarter trend view alongside the
// day-window (Colaberated) and per-reading (120 Days) A1C charts.
export const quarterly = (readings, timesPD, rate) => {
  const divisor = timesPD || 1;
  const buckets = new Map(); // key "year-quarter" -> { year, quarter, rows }

  readings.forEach((r) => {
    const d = parseStoredDate(r.date);
    if (!d) return; // skip rows with an unparsable date rather than mis-bucketing them
    const year = d.getFullYear();
    const quarter = Math.floor(d.getMonth() / 3) + 1; // 1-4
    const key = `${year}-${quarter}`;
    if (!buckets.has(key)) buckets.set(key, { year, quarter, rows: [] });
    buckets.get(key).rows.push(r);
  });

  // Chronological order (oldest quarter first), matching how every other
  // chart in this app reads left-to-right.
  const ordered = [...buckets.values()].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.quarter - b.quarter
  );

  return ordered.map(({ year, quarter, rows }) => {
    const total = sugarSum(rows);
    const avg = total / (divisor * rows.length);
    const a1c = parseFloat((avg * rate).toFixed(2));
    return { label: `Q${quarter} ${year}`, avg: parseFloat(avg.toFixed(2)), a1c, count: rows.length };
  });
};

// ── axis labels ───────────────────────────────────────────────────────────────
// Consolidated into one function instead of three separate exports.
// Labels are derived from the actual sliced data (`values`), so the label
// count always exactly matches the data count passed alongside it —
// eliminates the earlier bug where a static ['1'..'120'] array could
// mismatch a shorter/longer readings array and misalign the chart.
export const getLabels = (type, values = []) => {
  switch (type) {
    case 'bp':
      return values.slice(-90).map((_, i) => String(i + 1));
    case '120':
      return values.slice(-120).map((_, i) => String(i + 1));
    case 'a1c':
      return [''];
    default:
      return [];
  }
};
