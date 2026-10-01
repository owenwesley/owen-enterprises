import React, { createContext, useContext, useReducer } from 'react';

// Hydrate token and user from sessionStorage so a page refresh keeps the session
function loadSession() {
  try {
    const token = sessionStorage.getItem('oe_token');
    const user  = JSON.parse(sessionStorage.getItem('oe_user') || 'null');
    return { token, user };
  } catch { return { token: null, user: null }; }
}
const _session = loadSession();

export const InitialState = {
  token: _session.token || null,
  activeFeature: null,
  featurePreferences: {
    chkBgtracker: 1, chkCommunityLibrary: 1, chkMeetings: 1,
  },
  users: [],
  user: _session.user
    ? { ..._session.user, isLogedIn: true,
        firstNameError: '', lastNameError: '', userNameError: '',
        passwordError: '', emailError: '', loginError: '' }
    : {
        id: 0, firstName: '', lastName: '', userName: '', password: '',
        email: '', isLogedIn: false,
        firstNameError: '', lastNameError: '', userNameError: '',
        passwordError: '', emailError: '', loginError: '',
      },
  readings: [], bloodpressures: [], medications: [],
  nutritions: [], preferences: [],
  preference: {
    user_id: 0, timesPD: 0, chkNutrition: false, chkWeight: false, height: 0,
    chkMeds: false, chkMedsB: false, chkMedsL: false, chkMedsD: false, chkMedsBed: false,
    chkInsulin: false, typInsulin: 0, chkBP: false, chkSlidingScale: false,
    slidingScale1: 0, slidingScale2a: 0, slidingScale2b: 0, slidingScale3a: 0,
    slidingScale3b: 0, slidingScale4a: 0, slidingScale4b: 0, slidingScale5: 0, carbRatio: 0,
  },
  weights: [],
  books: [], movies: [], contacts: [],
  meetings: [], chairs: [], memos: [],
  Avg: 0, AvgBp: 0, A1C: 0.0, rate: 0.05, editIdx: -1,
  // Rule 2 (state isolation): in-progress edits live here, NOT in the main
  // data arrays. Keystrokes update this draft only, so re-renders, filter
  // recalculations and background refetches can't wipe what's being typed.
  // Merged back into the primary state only on explicit save.
  editDraft: null,
  bgChartData: {}, bpChartData: {}, a1cChartData: {}, a1cChartDataColaberated: {}, a1cChartDataQuarterly: {}, weightChartData: {},
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TOKEN':          return { ...state, token: action.payload };
    case 'SET_FEATURE':        return { ...state, activeFeature: action.payload, editIdx: -1, editDraft: null };
    case 'SET_FEATURE_PREFS':  return { ...state, featurePreferences: { ...state.featurePreferences, ...action.payload } };
    case 'SET_USERS':          return { ...state, users: action.payload };
    case 'UPDATE_USER':        return { ...state, user: { ...state.user, ...action.payload } };
    case 'SET_READINGS':       return { ...state, readings: action.payload };
    case 'SET_BLOODPRESSURES': return { ...state, bloodpressures: action.payload };
    case 'SET_MEDICATIONS':    return { ...state, medications: action.payload };
    case 'SET_WEIGHTS':        return { ...state, weights: action.payload };
    case 'SET_NUTRITIONS':     return { ...state, nutritions: action.payload };
    case 'SET_PREFERENCES':    return { ...state, preferences: action.payload };
    case 'SET_PREFERENCE':     return { ...state, preference: { ...state.preference, ...action.payload } };
    case 'SET_EDIT_IDX':       return { ...state, editIdx: action.payload };
    // Seed the draft with a copy of the row when editing begins.
    case 'BEGIN_EDIT':         return { ...state, editIdx: action.payload.rowId, editDraft: { ...action.payload.row } };
    // Per-keystroke field update — touches the draft only.
    case 'UPDATE_EDIT_DRAFT':  return { ...state, editDraft: { ...(state.editDraft || {}), [action.payload.name]: action.payload.value } };
    // Discard without saving.
    case 'CANCEL_EDIT':        return { ...state, editIdx: -1, editDraft: null };
    case 'SET_AVERAGES':       return { ...state, Avg: action.payload.avg, A1C: action.payload.a1c };
    case 'SET_AVG_BP':         return { ...state, AvgBp: action.payload };
    case 'SET_BG_CHART':       return { ...state, bgChartData: action.payload };
    case 'SET_BP_CHART':       return { ...state, bpChartData: action.payload };
    case 'SET_A1C_CHART':      return { ...state, a1cChartData: action.payload };
    case 'SET_A1C_COLABERATED':return { ...state, a1cChartDataColaberated: action.payload };
    case 'SET_A1C_QUARTERLY':  return { ...state, a1cChartDataQuarterly: action.payload };
    case 'SET_WEIGHT_CHART':   return { ...state, weightChartData: action.payload };
    case 'SET_BOOKS':          return { ...state, books: action.payload };
    case 'SET_MOVIES':         return { ...state, movies: action.payload };
    case 'SET_CONTACTS':       return { ...state, contacts: action.payload };
    case 'SET_MEETINGS':       return { ...state, meetings: action.payload };
    case 'SET_CHAIRS':        return { ...state, chairs: action.payload };
    case 'SET_MEMOS':         return { ...state, memos: action.payload };
    case 'RESET':
      sessionStorage.removeItem('oe_token');
      sessionStorage.removeItem('oe_user');
      return { ...InitialState, token: null,
               user: { id:0, firstName:'', lastName:'', userName:'', password:'',
                       email:'', isLogedIn:false, firstNameError:'', lastNameError:'',
                       userNameError:'', passwordError:'', emailError:'', loginError:'' } };
    default:                   return state;
  }
}

export const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, InitialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be inside <AppProvider>');
  return ctx;
}
