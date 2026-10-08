import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Switch, Route, Link, Redirect, useLocation } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import HomeIcon from '@mui/icons-material/Home';
import Tooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import useMediaQuery from '@mui/material/useMediaQuery';
import MenuIcon from '@mui/icons-material/Menu';

import { useAppContext } from '../../context/AppContext';
import { registerTokenGetter } from '../../utils/api';
import { useFeaturePreferences } from '../../hooks/useFeaturePreferences';
import { usePreferences } from '../../features/bgtracker/hooks/usePreferences';
import { useChartData } from '../../features/bgtracker/hooks/useChartData';
import { useReadings } from '../../features/bgtracker/hooks/useReadings';
import { useChairs } from '../../features/meetings/hooks/useChairs';
import { useMemos } from '../../features/meetings/hooks/useMemos';

import AccountMenu from './AccountMenu';
// Login, Register and Landing load with the app; every other page is loaded the
// first time it is visited (React.lazy), which keeps the first download small.
import LoginPage from '../../pages/LoginPage';
import RegisterPage from '../../pages/RegisterPage';
import Landing from '../../features/Landing';

// Wraps React.lazy. After a new deploy the chunk file names change, so a tab that was
// opened before it asks for a file that no longer exists and the import fails. The
// first time that happens we reload the page once to pick up the new version; the
// flag is cleared as soon as any page loads, so it can never loop.
const RELOAD_FLAG = 'chunk-reload-once';
function lazyPage(load) {
  return lazy(() => load().then(
    (mod) => {
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* storage unavailable */ }
      return mod;
    },
    (err) => {
      let already = true;
      try {
        already = sessionStorage.getItem(RELOAD_FLAG) === '1';
        if (!already) sessionStorage.setItem(RELOAD_FLAG, '1');
      } catch { /* storage unavailable: do not reload, show the error instead */ }
      if (!already) { window.location.reload(); return new Promise(() => {}); }
      throw err;
    }
  ));
}

const FeaturePreferencesPage = lazyPage(() => import('../../pages/FeaturePreferencesPage'));
const ProfilePage = lazyPage(() => import('../../pages/ProfilePage'));
const DoctorHomePage = lazyPage(() => import('../../pages/DoctorHomePage'));
const DoctorClinicPage = lazyPage(() => import('../../pages/DoctorClinicPage'));
const DoctorPatientDetailPage = lazyPage(() => import('../../pages/DoctorPatientDetailPage'));
const AdminDoctorsPage = lazyPage(() => import('../../pages/AdminDoctorsPage'));
const MyDoctorsPage = lazyPage(() => import('../../pages/MyDoctorsPage'));
const ReadingsPage = lazyPage(() => import('../../features/bgtracker/pages/ReadingsPage'));
const NutritionPage = lazyPage(() => import('../../features/bgtracker/pages/NutritionPage'));
// pages.jsx exports several named pages; lazy() needs a default export.
const fromPages = (name) => lazyPage(() => import('../../features/bgtracker/pages/pages').then((m) => ({ default: m[name] })));
const BloodPressurePage = fromPages('BloodPressurePage');
const WeightPage = fromPages('WeightPage');
const MedicationsPage = fromPages('MedicationsPage');
const ChartsPage = fromPages('ChartsPage');
const PreferencesPage = fromPages('PreferencesPage');
const HelpPage = fromPages('HelpPage');
const BooksPage = lazyPage(() => import('../../features/communityLibrary/BooksPage'));
const MoviesPage = lazyPage(() => import('../../features/communityLibrary/MoviesPage'));
const ContactsPage = lazyPage(() => import('../../features/communityLibrary/ContactsPage'));
const MeetingsPage = lazyPage(() => import('../../features/meetings/MeetingsPage'));
const ChairsPage = lazyPage(() => import('../../features/meetings/ChairsPage'));
const MemosPage = lazyPage(() => import('../../features/meetings/MemosPage'));
const ChurchPage = lazyPage(() => import('../../features/church/ChurchPage'));

// ── style tokens (formerly makeStyles) ────────────────────────────────────────
const sx = {
  bar:     { background: 'linear-gradient(90deg,#1a237e,#283593)' },
  feature: { fontWeight: 700, color: 'rgba(255,255,255,0.7)', mr: 2 },
  link:    { color: '#fff', textDecoration: 'none', mr: 1.5, fontSize: 14 },
  iconBtn: { color: '#fff' },
};

const FEATURE_LABELS = {
  bgtracker: 'BG Tracker', communityLibrary: 'Community Library', meetings: 'Meetings', church: 'Church',
};

// Nav labels/links are frequency-aware, driven by the `timesPD` preference
// (how many times per day the user logs). This replaces the old flat
// "always show BP/Weight sub-pages if the pref is checked" logic.
//   - timesPD 1 or 2 AND chkBP: BP is the primary thing being tracked at low
//     check-in frequency, so the "/" link and its chart link read as
//     "BP Tracker" / "BP Chart" instead of the usual glucose-first labels,
//     and the A1C chart (a glucose-derived metric) is left off the nav.
//   - Otherwise (timesPD >= 3, or chkBP off): glucose-first — "/" stays
//     "BG Tracker" — and chkBP/chkWeight (if set) each get their OWN
//     dedicated pages in addition to the primary BG link/chart.
// Medications is gated on chkMeds (previously always shown regardless of the
// preference). Nutrition is gated on chkNutrition the same way.
function buildBgNav(preference) {
  const timesPD = Number(preference.timesPD) || 0;
  const { chkBP, chkWeight, chkMeds, chkNutrition } = preference;
  const lowFreqBPPrimary = (timesPD === 1 || timesPD === 2) && chkBP;

  const nav = [];

  if (lowFreqBPPrimary) {
    nav.push({ to: '/bptracker', label: 'BP Tracker' });
    nav.push({ to: '/bpchart', label: 'BP Chart' });
    if (chkWeight) {
      nav.push({ to: '/weighttracker', label: 'Weight Tracker' });
      nav.push({ to: '/weightchart', label: 'Weight Chart' });
    }
  } else {
    nav.push({ to: '/', label: 'BG Tracker' });
    nav.push({ to: '/bgchart', label: 'BG Chart' });
    nav.push({ to: '/a1cchart', label: 'A1C Chart' });
    if (chkBP) {
      nav.push({ to: '/bptracker', label: 'BP Tracker' });
      nav.push({ to: '/bpchart', label: 'BP Chart' });
    }
    if (chkWeight) {
      nav.push({ to: '/weighttracker', label: 'Weight Tracker' });
      nav.push({ to: '/weightchart', label: 'Weight Chart' });
    }
  }

  if (chkMeds) nav.push({ to: '/medications', label: 'Medications' });
  if (chkNutrition) nav.push({ to: '/nutrition', label: 'Nutrition' });
  nav.push({ to: '/preferences', label: 'Preferences' });
  nav.push({ to: '/help', label: 'Help' });

  return nav;
}

// The edit state (which row is being edited, and the draft) is global and is
// just an index/id. Without this, starting to edit row 3 of one table and then
// opening another page left row 3 of THAT table in edit mode as well.
function ResetEditOnNavigate() {
  const { dispatch } = useAppContext();
  const { pathname } = useLocation();
  useEffect(() => { dispatch({ type: 'CANCEL_EDIT' }); }, [pathname, dispatch]);
  return null;
}

// Phones and small tablets (< 900px) get a hamburger + drawer instead of the
// horizontally scrolling link strip; the bar keeps only home/profile/settings
// and a compact logout so nothing is pushed off-screen.
function TopBar({ navItems }) {
  const { state, dispatch } = useAppContext();
  const { activeFeature } = state;
  const { pathname } = useLocation();
  // Hamburger + drawer on narrow screens AND on touch devices held sideways
  // (a landscape phone is wider than 900px but only ~400px tall, so the link
  // row was eating scarce height). Same landscape-phone test the A1C chart uses.
  const isNarrow = useMediaQuery('(max-width:899.95px), (pointer: coarse) and (max-height: 500px)');
  const [open, setOpen] = useState(false);
  const goHome = () => dispatch({ type: 'SET_FEATURE', payload: null });

  if (!isNarrow) {
    return (
            <AppBar position="static" sx={sx.bar}>
              <Toolbar>
                {activeFeature && (
                  <>
                    <Box component={Link} to="/" sx={{ ...sx.link, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      onClick={() => dispatch({ type: 'SET_FEATURE', payload: null })}>
                      <Tooltip title="Back to home">
                        <IconButton size="small" sx={sx.iconBtn}
                          onClick={() => dispatch({ type: 'SET_FEATURE', payload: null })}>
                          <HomeIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Typography sx={{ ...sx.feature, flexShrink: 0 }}>{FEATURE_LABELS[activeFeature]}</Typography>
                  </>
                )}

                {/* Viewport-overflow fix: this row can have up to ~11 links
                    (bgtracker with BP + Weight tracking on). A plain flex row
                    with no wrap/scroll would overflow the AppBar on narrow
                    (mobile) viewports, and since the app shell disables
                    page-level scrolling (see App.css/index.css), overflowed
                    links would become permanently unreachable rather than
                    just requiring a scroll. `minWidth: 0` is required here —
                    without it a flex child refuses to shrink below its
                    content width, so overflowX would never actually engage. */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: '1 1 auto',
                    minWidth: 0,
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    whiteSpace: 'nowrap',
                    '&::-webkit-scrollbar': { height: 4 },
                  }}
                >
                  {navItems.map((n) => (
                    <Box key={n.to} component={Link} to={n.to} sx={sx.link}>{n.label}</Box>
                  ))}
                </Box>

                <AccountMenu />
              </Toolbar>
            </AppBar>
    );
  }

  const close = () => setOpen(false);
  return (
    <AppBar position="static" sx={sx.bar}>
      <Toolbar variant="dense" sx={{ gap: 0.5, minHeight: 52, px: 1 }}>
        {activeFeature && navItems.length > 0 && (
          <IconButton edge="start" sx={sx.iconBtn} aria-label="Open menu" onClick={() => setOpen(true)}>
            <MenuIcon />
          </IconButton>
        )}
        {activeFeature && (
          <IconButton component={Link} to="/" sx={sx.iconBtn} aria-label="Back to home" onClick={goHome}>
            <HomeIcon />
          </IconButton>
        )}
        <Typography noWrap sx={{ flex: '1 1 auto', minWidth: 0, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
          {activeFeature ? FEATURE_LABELS[activeFeature] : ''}
        </Typography>
        <AccountMenu compact />
      </Toolbar>

      <Drawer anchor="left" open={open} onClose={close}>
        <Box sx={{ width: 260, maxWidth: '80vw' }} role="navigation">
          <Typography sx={{ p: 2, fontWeight: 700, color: '#1a237e' }}>
            {activeFeature ? FEATURE_LABELS[activeFeature] : ''}
          </Typography>
          <List disablePadding>
            {navItems.map((n) => (
              <ListItemButton key={n.to} component={Link} to={n.to} onClick={close}
                selected={n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)}
                sx={{ minHeight: 48 }}>
                <ListItemText primary={n.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
    </AppBar>
  );
}

function AuthGate({ children }) {
  const { state } = useAppContext();
  return state.user.isLogedIn ? children : <Redirect to="/login" />;
}

export default function NavBar() {
  const { state } = useAppContext();
  const { user, preference, activeFeature } = state;

  useEffect(() => { registerTokenGetter(() => state.token); }, [state.token]);

  const { loadFeaturePreferences } = useFeaturePreferences();
  const { loadUserPreference } = usePreferences();
  const { rebuildAllCharts } = useChartData();
  const { getReadings } = useReadings();
  const { getChairs } = useChairs();
  const { getMemos } = useMemos();

  useEffect(() => {
    if (user.isLogedIn && user.id) {
      loadFeaturePreferences(user.id);
      loadUserPreference(user.id);
      getReadings(user.id);
    }
  }, [user.isLogedIn, user.id, getReadings, loadFeaturePreferences, loadUserPreference]);

  // Pre-load chairs and memos whenever meetings feature is activated
  useEffect(() => {
    if (user.isLogedIn && user.id && activeFeature === 'meetings') {
      getChairs();
      getMemos();
    }
  }, [user.isLogedIn, user.id, activeFeature, getChairs, getMemos]);

  // Fix: this only ran when state.readings.length > 0 — readings are the
  // glucose log, a completely different thing from blood pressure or weight.
  // A user who only tracks BP (or only weight) has zero readings, so this
  // effect never fired for them, buildBPChart()/buildWeightChart() never ran,
  // and bpChartData/weightChartData stayed at their InitialState value of {}
  // forever — an empty chart, not a crash, so it looked like "the chart just
  // doesn't show" rather than an error. Each individual build*Chart()
  // function already guards its own precondition (e.g. buildBPChart no-ops
  // on `!bloodpressures`, buildA1CChart/buildA1CColaberated no-op on empty
  // readings), so rebuildAllCharts() itself doesn't need this gate — calling
  // it is always safe. bloodpressures and weights are now explicit
  // dependencies too, rather than relying on their change cascading through
  // buildBPChart -> rebuildAllCharts reference identity to retrigger this
  // effect, which worked but was fragile against a future edit to either
  // hook breaking the chain silently.
  useEffect(() => {
    if (user.isLogedIn) {
      rebuildAllCharts();
    }
  }, [state.readings, state.bloodpressures, state.weights, preference.timesPD, user.isLogedIn, rebuildAllCharts]);

  const bgNav = buildBgNav(preference);

  const navMap = {
    bgtracker: bgNav,
    communityLibrary: [{ to: '/books', label: '📚 Books' }, { to: '/movies', label: '🎬 Movies' }, { to: '/contacts', label: '👤 Contacts' }],
    meetings: [
      { to: '/meetings', label: '🤝 Meetings' },
      { to: '/chairs', label: '👤 Chairs' },
      { to: '/memos', label: '📝 Memos' },
    ],
    church: [{ to: '/my-church', label: '⛪ Church' }],
  };

  const navItems = activeFeature ? (navMap[activeFeature] || []) : [];

  return (
    <Router>
      <div className="app-shell">
      <ResetEditOnNavigate />
      {user.isLogedIn && <TopBar navItems={navItems} />}

      <div className="app-content">
      <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>}>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />

        <Route path="/" exact>
          <AuthGate>
            {user.role === 'doctor' ? <Redirect to="/doctor" /> :
              user.role === 'admin' ? <Redirect to="/admin" /> :
              activeFeature === 'bgtracker' ? <ReadingsPage /> :
              activeFeature === 'communityLibrary' ? <BooksPage /> :
                activeFeature === 'meetings' ? <MeetingsPage /> :
                  activeFeature === 'church' ? <ChurchPage /> : <Landing />}
          </AuthGate>
        </Route>

        {/* Doctor portal — doctors land here instead of the feature picker.
            /doctor/clinic and /doctor/patients/:id must come BEFORE the
            generic /doctor route: Route matching here isn't exact-path, so
            "/doctor" alone would otherwise also match both of those and
            always render the home page first. */}
        <Route path="/doctor/clinic">
          <AuthGate>{user.role === 'doctor' ? <DoctorClinicPage /> : <Redirect to="/" />}</AuthGate>
        </Route>
        <Route path="/doctor/patients/:patientId">
          <AuthGate>{user.role === 'doctor' ? <DoctorPatientDetailPage /> : <Redirect to="/" />}</AuthGate>
        </Route>
        <Route path="/doctor">
          <AuthGate>{user.role === 'doctor' ? <DoctorHomePage /> : <Redirect to="/" />}</AuthGate>
        </Route>

        {/* Admin — approve/reject doctor accounts */}
        <Route path="/admin">
          <AuthGate>{user.role === 'admin' ? <AdminDoctorsPage /> : <Redirect to="/" />}</AuthGate>
        </Route>

        {/* Patient-side: link to doctors and control what each one can see */}
        <Route path="/my-doctors">
          <AuthGate>{user.role === 'patient' ? <MyDoctorsPage /> : <Redirect to="/" />}</AuthGate>
        </Route>

        <Route path="/feature-preferences"><AuthGate><FeaturePreferencesPage /></AuthGate></Route>
        <Route path="/profile"><AuthGate><ProfilePage /></AuthGate></Route>

        {/* BGTracker */}
        <Route path="/bptracker">     <AuthGate><BloodPressurePage /></AuthGate></Route>
        <Route path="/weighttracker"> <AuthGate><WeightPage /></AuthGate></Route>
        <Route path="/weightchart">   <AuthGate><ChartsPage type="weight" /></AuthGate></Route>
        <Route path="/medications">   <AuthGate><MedicationsPage /></AuthGate></Route>
        <Route path="/nutrition">     <AuthGate><NutritionPage /></AuthGate></Route>
        <Route path="/bgchart">       <AuthGate><ChartsPage type="bg" /></AuthGate></Route>
        <Route path="/bpchart">       <AuthGate><ChartsPage type="bp" /></AuthGate></Route>
        <Route path="/a1cchart">      <AuthGate><ChartsPage type="a1c" /></AuthGate></Route>
        <Route path="/preferences">   <AuthGate><PreferencesPage /></AuthGate></Route>
        <Route path="/help">          <AuthGate><HelpPage /></AuthGate></Route>

        {/* Community Library */}
        <Route path="/books">  <AuthGate><BooksPage /></AuthGate></Route>
        <Route path="/movies"> <AuthGate><MoviesPage /></AuthGate></Route>
        <Route path="/contacts"><AuthGate><ContactsPage /></AuthGate></Route>

        {/* Meetings + sub-pages */}
        <Route path="/meetings"><AuthGate><MeetingsPage /></AuthGate></Route>
        <Route path="/chairs">  <AuthGate><ChairsPage /></AuthGate></Route>
        <Route path="/memos">   <AuthGate><MemosPage /></AuthGate></Route>

        {/* Church (page path /my-church; the API prefix /church is separate) */}
        <Route path="/my-church"><AuthGate><ChurchPage /></AuthGate></Route>

        <Route><Redirect to="/login" /></Route>
      </Switch>
      </Suspense>
      </div>
      </div>
    </Router>
  );
}
