import React from 'react';
import { BrowserRouter as Router, Route, Link, useLocation } from 'react-router-dom';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, BarElement, LineElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { a1cOptions, a1cOptions120Day, a1cOptionsQuarterly, bgOptions, bpOptions, weightOptions } from './chartOptions';

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, BarElement, LineElement,
  Title, Tooltip, Legend
);

// ── bar label plugin ──────────────────────────────────────────────────────────
const getRgb = (color) => {
  if (!color) return null;
  if (Array.isArray(color)) return getRgb(color[0]);
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
};

const contrastColor = (bg) => {
  const rgb = getRgb(bg);
  if (!rgb) return '#000';
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 >= 0.6 ? '#000' : '#fff';
};

const barLabelPlugin = {
  id: 'barLabelPlugin',
  afterDatasetsDraw(chart) {
    // No in-bar text on phones. Checked on every draw (a chart's plugins are
    // fixed when it is created, so a prop-based check went stale on resize or
    // rotation): a narrow chart, or a touch device in landscape.
    if (chart.width < 700 || window.matchMedia('(pointer: coarse) and (max-height: 500px)').matches) return;
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((bar, i) => {
        const a1c = dataset.a1c  ?? dataset.data[i];
        const avg = dataset.avg  ?? dataset.data[i];
        if (a1c == null) return;
        const bgColor = Array.isArray(dataset.backgroundColor)
          ? dataset.backgroundColor[i]
          : dataset.backgroundColor;
        ctx.save();
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = contrastColor(bgColor);
        const cy = bar.y + bar.height / 2;
        ctx.fillText(`A1C: ${a1c} %`,       bar.x, cy - 12);
        ctx.fillText(`Avg: ${avg} mg / dl`,  bar.x, cy + 12);
        ctx.restore();
      });
    });
  },
};

// ── chart safe guard ──────────────────────────────────────────────────────────
// Bug 3 fix: only render <Bar>/<Line> when data is fully formed
const hasData = (d) => d && Array.isArray(d.datasets) && Array.isArray(d.labels);

// A1C chart sub-navigation: an MUI fullWidth <Tabs> strip. Each <Tab> is a
// router <Link>, so the URLs (/a1cchart/colaberated, /120days, /quarterly) and
// back/forward keep working. The selected tab comes from the current URL, and
// /a1cchart on its own counts as Colaberated (it renders that chart).
// Must be rendered inside <Router> (it uses useLocation).
const A1C_TABS = [
  { label: 'Colaberated', to: '/a1cchart/colaberated' },
  { label: '120 Days',    to: '/a1cchart/120days' },
  { label: 'Quarterly',   to: '/a1cchart/quarterly' },
];

const a1cTabsSx = {
  flex: '0 0 auto',
  width: '100%',
  minHeight: 40,
  borderBottom: 1,
  borderColor: 'divider',
  '& .MuiTabs-indicator': { backgroundColor: '#1a237e' },
  '& .MuiTab-root': {
    minWidth: 0,
    minHeight: 40,
    px: 0.5,
    textTransform: 'none',
    fontWeight: 600,
    fontSize: 'clamp(12px, 3.6vw, 17px)',
    whiteSpace: 'nowrap',
  },
  '& .MuiTab-root.Mui-selected': { color: '#1a237e' },
};

const A1CTabs = () => {
  const { pathname } = useLocation();
  const path = pathname === '/a1cchart' || pathname === '/a1cchart/' ? '/a1cchart/colaberated' : pathname;
  const value = A1C_TABS.some((t) => t.to === path) ? path : false;
  return (
    <Tabs value={value} variant="fullWidth" sx={a1cTabsSx}>
      {A1C_TABS.map((t) => (
        <Tab key={t.to} label={t.label} value={t.to} component={Link} to={t.to} />
      ))}
    </Tabs>
  );
};

// Wrapper for every chart page (A1C, BG, BP, weight). Flex column: any header
// sits at its natural height and the chart box below takes whatever is left.
// overflow hidden keeps a stray child from pushing the page wider/taller than
// the shell; minHeight 0 lets this flex child shrink instead of overflowing.
const chartPageSx = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  position: 'relative',
  width: '100%',
  flex: '1 1 auto',
  minHeight: 0,
  height: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  padding: '8px',
  margin: '0 auto',
  backgroundColor: 'white',
};

// Chart.js sizes its <canvas> to its PARENT element, so that parent must hold
// the canvas and nothing else. Headers / messages go beside it, never inside.
const ChartBox = ({ children }) => (
  <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, width: '100%' }}>
    {children}
  </div>
);

const NoData = ({ children = 'No data' }) => <div>{children}</div>;

// ── A1C Chart (colaberated + 120-day) ────────────────────────────────────────
// Converted from an implicit-return arrow to a full function body so it can
// call useMediaQuery — a live-updating, reactive breakpoint check that
// re-evaluates on resize/rotation, unlike a one-time window.innerWidth read
// (which stayed stale for the component's whole lifetime).
export const A1CChart = ({ chartDataColaberated, chartDataQuarterly, chartData }) => {

  return (
    <Router>
      <A1CTabs />

      {/* Colaberated: 7 bars (Day1 / Day7 / Day14 / Day30 / Day60 / Day90 / Day120) */}
      {/* Also the landing view: /a1cchart on its own used to show only the tabs and an empty page. */}
      <Route exact path={['/a1cchart', '/a1cchart/colaberated']}>
        <Box sx={chartPageSx}>
          {hasData(chartDataColaberated) ? (
            <ChartBox>
              <Bar data={chartDataColaberated} options={a1cOptions} plugins={[barLabelPlugin]} />
            </ChartBox>
          ) : (
            <NoData>No data — check that readings are loaded.</NoData>
          )}
        </Box>
      </Route>

      {/* 120-day: one bar per reading, colour-coded by A1C range */}
      <Route path="/a1cchart/120days">
        <Box sx={chartPageSx}>
          {hasData(chartData) ? (
            <ChartBox><Bar data={chartData} options={a1cOptions120Day} /></ChartBox>
          ) : (
            <NoData>No data — check that readings are loaded.</NoData>
          )}
        </Box>
      </Route>

      {/* Quarterly: one bar per calendar quarter that has readings, oldest → newest */}
      <Route path="/a1cchart/quarterly">
        <Box sx={chartPageSx}>
          {hasData(chartDataQuarterly) ? (
            <ChartBox><Bar data={chartDataQuarterly} options={a1cOptionsQuarterly} /></ChartBox>
          ) : (
            <NoData>No data — check that readings are loaded.</NoData>
          )}
        </Box>
      </Route>
    </Router>
  );
};

// ── BG Line Chart ─────────────────────────────────────────────────────────────
export const BGChart = ({ chartData }) => (
  <Box sx={chartPageSx}>
    {hasData(chartData)
      ? <ChartBox><Line data={chartData} options={bgOptions} /></ChartBox>
      : <NoData />}
  </Box>
);

// Shared centered header for charts that display a summary average above them
const ChartAverageHeader = ({ children }) => (
  <div style={{
    flex: '0 0 auto',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 'clamp(0.85rem, 3.6vw, 1rem)',
    overflowWrap: 'anywhere',
    color: '#1a237e',
    padding: '4px 0',
  }}>
    {children}
  </div>
);

// ── BP Line Chart ─────────────────────────────────────────────────────────────
// `average` is a pre-formatted "SYS/DIAS/HR" string (e.g. "120/80/80")
export const BPChart = ({ chartData, average }) => (
  <Box sx={chartPageSx}>
    {average && (
      <ChartAverageHeader>Average Blood Pressure: {average}</ChartAverageHeader>
    )}
    {hasData(chartData)
      ? <ChartBox><Line data={chartData} options={bpOptions} /></ChartBox>
      : <NoData />}
  </Box>
);

// ── Weight Line Chart (LBS / KG / BMI) ────────────────────────────────────────
// `average` is a pre-formatted LBS value (e.g. "220.00")
export const WeightChart = ({ chartData, average }) => (
  <Box sx={chartPageSx}>
    {average && (
      <ChartAverageHeader>Average Weight: {average} LBS</ChartAverageHeader>
    )}
    {hasData(chartData)
      ? <ChartBox><Line data={chartData} options={weightOptions} /></ChartBox>
      : <NoData />}
  </Box>
);
