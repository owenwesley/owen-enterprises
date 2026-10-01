/**
 * Chart.js v3 options.
 *
 * v2 → v3 breaking changes applied here:
 *  - scales / layout moved OUT of plugins to top level
 *  - yAxes:[{ticks:{beginAtZero}}] → scales:{ y:{ beginAtZero:true } }
 *  - fontColor → color  (legend labels)
 *  - lineTension → tension  (dataset option, used in BG/BP charts)
 */

const commonScales = {
  y: {
    beginAtZero: true,
  },
};

const commonLayout = {
  padding: { left: 0, top: 0, right: 0, bottom: 0 },
};

/**
 * Shared tooltip title builder: renders "Day {position}-{MM/DD}" using the
 * real calendar date carried on the dataset's `dates` array (same index
 * alignment as `data`), falling back to just the position number if no
 * date is available for that index.
 */
const dayWithDateTitle = (items) => {
  if (!items.length) return '';
  const item = items[0];
  const position = item.label;
  const dates = item.dataset?.dates;
  const stored = Array.isArray(dates) ? dates[item.dataIndex] : null;
  if (!stored) return `Day ${position}`;
  // stored is MM-DD-YY → display as MM/DD
  const [mm, dd] = String(stored).split('-');
  return mm && dd ? `Day ${position}-${mm}/${dd}` : `Day ${position}`;
};

// ── Colaberated A1C bar chart ─────────────────────────────────────────────────
export const a1cOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: commonLayout,
  scales: commonScales,
  plugins: {
    title: {
      display: true,
      text: 'A1C Chart',
    },
    tooltip: {
      enabled: true,
      callbacks: {
        title: (items) => (items.length ? `${items[0].dataset?.label ?? ''}` : ''),
        label: (item) => {
          const a1c  = item.formattedValue;
          const avgRaw = item.dataset?.avg;
          const avg  = Array.isArray(avgRaw) ? avgRaw[item.dataIndex] : avgRaw;
          const lines = [`A1C: ${a1c} %`];
          if (avg != null && avg !== '') lines.push(`Avg: ${avg} mg / dl`);
          return lines;
        },
      },
    },
    legend: {
      display: true,
      position: 'bottom',
      labels: { color: '#000' },
    },
  },
};

// ── 120-day A1C bar chart ─────────────────────────────────────────────────────
export const a1cOptions120Day = {
  responsive: true,
  maintainAspectRatio: false,
  layout: commonLayout,
  scales: commonScales,
  plugins: {
    title: {
      display: true,
      text: 'A1C 120 Day Chart',
    },
    tooltip: {
      enabled: true,
      callbacks: {
        // Now shows e.g. "Day 120-09/12" instead of just "Day: 120"
        title: dayWithDateTitle,
        label: (item) => {
          const a1c    = item.formattedValue;
          const avgRaw = item.dataset?.avg;
          const avg    = Array.isArray(avgRaw) ? avgRaw[item.dataIndex] : avgRaw;
          const lines  = [`A1C: ${a1c} %`];
          if (avg != null && avg !== '') lines.push(`Avg: ${avg} mg / dl`);
          return lines;
        },
      },
    },
    legend: {
      display: true,
      position: 'bottom',
      labels: { color: '#000' },
    },
  },
};

// ── Quarterly A1C bar chart ────────────────────────────────────────────────────
// Labels are already "Q1 2024"-style quarter names (see chartData.js's
// `quarterly()`), so the tooltip title just echoes the bar's own label
// instead of the "Day N-MM/DD" format used by the per-reading charts.
export const a1cOptionsQuarterly = {
  responsive: true,
  maintainAspectRatio: false,
  layout: commonLayout,
  scales: commonScales,
  plugins: {
    title: {
      display: true,
      text: 'A1C Quarterly Chart',
    },
    tooltip: {
      enabled: true,
      callbacks: {
        title: (items) => (items.length ? items[0].label : ''),
        label: (item) => {
          const a1c    = item.formattedValue;
          const avgRaw = item.dataset?.avg;
          const avg    = Array.isArray(avgRaw) ? avgRaw[item.dataIndex] : avgRaw;
          const lines  = [`A1C: ${a1c} %`];
          if (avg != null && avg !== '') lines.push(`Avg: ${avg} mg / dl`);
          return lines;
        },
      },
    },
    legend: {
      display: true,
      position: 'bottom',
      labels: { color: '#000' },
    },
  },
};

// ── Blood Pressure line chart ─────────────────────────────────────────────────
export const bpOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: commonLayout,
  scales: commonScales,
  plugins: {
    title: {
      display: true,
      text: 'Blood Pressure Chart',
    },
    tooltip: {
      enabled: true,
      callbacks: {
        // Same "Day N-MM/DD" format as the BG/A1C charts
        title: dayWithDateTitle,
      },
    },
    legend: {
      display: true,
      position: 'bottom',
      labels: { color: '#000' },
    },
  },
};

// ── Blood Glucose line chart ──────────────────────────────────────────────────
export const bgOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: commonLayout,
  scales: commonScales,
  plugins: {
    title: {
      display: true,
      text: 'Blood Glucose Chart',
    },
    tooltip: {
      enabled: true,
      callbacks: {
        // Now shows e.g. "Day 1-05/18" instead of just "1"
        title: dayWithDateTitle,
      },
    },
    legend: {
      display: true,
      position: 'bottom',
      labels: { color: '#000' },
    },
  },
};

// ── Weight line chart (LBS / KG / BMI) ────────────────────────────────────────
export const weightOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: commonLayout,
  scales: commonScales,
  plugins: {
    title: {
      display: true,
      text: 'Weight Chart',
    },
    tooltip: {
      enabled: true,
      callbacks: {
        title: dayWithDateTitle,
      },
    },
    legend: {
      display: true,
      position: 'bottom',
      labels: { color: '#000' },
    },
  },
};
