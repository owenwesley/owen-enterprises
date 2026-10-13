import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getBlobUrl } from '../../../utils/api';

// The logo shipped with the app (public, generic). Shown when the user has not uploaded their own.
export const DEFAULT_LOGO = '/images/meetings/default-logo.webp';
export const LOGO_CHANGED = 'oe:meeting-logo-changed';

// The user's meeting logo: { url, custom, reload }. `custom` is true when it is the user's own picture
// (served by GET /meetings/logo/:id behind sign-in), false when the default is shown. Reloads when the page
// fires 'oe:meeting-logo-changed' (after a change/remove).
export function useMeetingLogo() {
  const { state } = useAppContext();
  const userId = state.user.id;
  const role = state.user.role;
  const enabled = !!state.user.isLogedIn && !!userId && role !== 'doctor' && role !== 'admin';
  const [logo, setLogo] = useState({ url: DEFAULT_LOGO, custom: false });
  const made = useRef(null);

  const release = () => { if (made.current) { URL.revokeObjectURL(made.current); made.current = null; } };

  const reload = useCallback(async () => {
    if (!enabled) return;
    const u = await getBlobUrl(`/meetings/logo/${userId}`);   // null = no own logo (or not reachable)
    release();
    made.current = u;
    setLogo(u ? { url: u, custom: true } : { url: DEFAULT_LOGO, custom: false });
  }, [enabled, userId]);

  useEffect(() => {
    reload();
    window.addEventListener(LOGO_CHANGED, reload);
    return () => { window.removeEventListener(LOGO_CHANGED, reload); };
  }, [reload]);
  useEffect(() => release, []);   // free the temporary URL when the component goes away

  return { ...logo, reload };
}
