import { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getQuiet } from '../../../utils/api';

export const REPORTS_CHANGED = 'oe:meeting-reports-changed';

// Reports saved on the server that the user has not printed/saved yet: { reports, count, reload }.
// Checked on load, once a minute, when the tab regains focus, and when the page fires
// 'oe:meeting-reports-changed' (after a Reset Period or a download). Drives the badge on the Meetings link.
export function useMeetingReports() {
  const { state } = useAppContext();
  const userId = state.user.id;
  const role = state.user.role;
  const enabled = !!state.user.isLogedIn && !!userId && role !== 'doctor' && role !== 'admin'
    && state.featurePreferences?.chkMeetings === 1;
  const [reports, setReports] = useState([]);

  const reload = useCallback(() => {
    if (!enabled) return Promise.resolve();
    // A background check: no error toast if it fails (keeps the last list).
    return getQuiet(`/meetings/reports/${userId}`)
      .then((d) => { if (d && Array.isArray(d.reports)) setReports((old) => (JSON.stringify(old) === JSON.stringify(d.reports) ? old : d.reports)); });
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled) { setReports([]); return undefined; }
    reload();
    const timer = setInterval(reload, 60000);
    const onFocus = () => { if (document.visibilityState !== 'hidden') reload(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener(REPORTS_CHANGED, reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener(REPORTS_CHANGED, reload);
    };
  }, [enabled, reload]);

  return { reports, count: reports.length, reload };
}
