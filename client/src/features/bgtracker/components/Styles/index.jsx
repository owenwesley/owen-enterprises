import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

// Table style tokens, formerly a makeStyles() hook. MUI v5 style: plain sx
// objects, consumed directly via the sx prop — no hook call needed since
// nothing here depends on the theme or component props.
//
// Rule 4: the table fills whatever space the app shell gives it and scrolls
// internally. Previously `maxHeight` was `window.innerHeight - 90`, read once
// at module load — that never updated on resize or rotation, and it
// double-counted the app bar once the shell layout took over sizing.
// Phones/tablets: keep the Date column pinned while the table scrolls sideways,
// so you always know which row you are reading. Rows being edited and totals
// rows opt out (class names row-editing / totals-row) because their first cell
// is wide or spans several columns.
export const stickyFirstColSx = {
  '@media (max-width:899.95px)': {
    '& thead tr:first-of-type th:first-of-type': {
      position: 'sticky', left: 0, zIndex: 4,
    },
    '& tbody tr:not(.row-editing):not(.totals-row) > td:first-of-type': {
      position: 'sticky', left: 0, zIndex: 1,
      backgroundColor: '#fff',
      boxShadow: '2px 0 3px -1px rgba(0,0,0,0.25)',
    },
  },
};

// Two-row grouped headers (BG readings with 3+ meals, Meetings): MUI's
// stickyHeader gives EVERY header cell `top: 0`, so when the table scrolls
// vertically the second header row slid up under the first one. Row 2 is
// pushed down by the height of row 1, which useHeaderRowOffset() measures and
// publishes as the CSS variable --head-row1-h on the table container. Tables
// with a single header row have no second row, so this rule never matches.
export const twoRowHeaderSx = {
  '& thead tr:nth-of-type(2) th': { top: 'var(--head-row1-h, 37px)' },
};

/** Attach the returned ref to the <TableContainer> of a table with a two-row header. */
export function useHeaderRowOffset() {
  const ref = useRef(null);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const tr = el.querySelector('thead tr');
    if (tr) el.style.setProperty('--head-row1-h', `${tr.getBoundingClientRect().height}px`);
  }, []);
  // Every render: switching the number of readings per day changes the header.
  useLayoutEffect(measure);
  useEffect(() => {
    window.addEventListener('resize', measure);
    let ro;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      ro = new ResizeObserver(measure);
      ro.observe(ref.current);
    }
    return () => {
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
    };
  }, [measure]);
  return ref;
}

// Add button used in the table headers (Weights, Medications, Blood pressure).
// A plain MUI <Button variant="contained" size="small" sx={addButtonSx}>.
// Navy matches the Add buttons on the Memos, Chairs and Meetings pages, and
// white-on-navy is readable (white-on-cyan was not). To restyle every one of
// these buttons, change this object only.
export const addButtonSx = {
  backgroundColor: '#1a237e',
  color: '#fff',
  borderRadius: '50px',
  textTransform: 'none',
  fontWeight: 600,
  px: 2.5,
  '&:hover': { backgroundColor: '#283593' },
};

// Add button for the BG readings table. Green when the most recent reading has
// evening or bedtime meds checked, faded red when not. Same look as the old
// styled AddButton: hover keeps the same color, and it still calls onAdd when
// clicked (the faded look and not-allowed cursor are a hint, not a disable).
export const addReadingButtonSx = (readings) => {
  const last = readings?.[readings.length - 1];
  const medsGiven = Boolean(last?.chkMedsD || last?.chkMedsBed);
  const bg = medsGiven ? 'lightgreen' : 'lightcoral';
  return {
    backgroundColor: bg,
    p: '5px',
    mb: '10px',
    border: 'none',
    cursor: medsGiven ? 'pointer' : 'not-allowed',
    opacity: medsGiven ? 1 : 0.5,
    '&:hover': { backgroundColor: bg },
  };
};

// Wrapper for the readings page (BG table / BP-only table). Passes the shell's
// bounded height down so the table scrolls internally instead of pushing the
// page into overflow, and tints the background by the user's A1C:
// blue <=5.6, yellow <=6.5, green <=7.5, orange <=8.5, red above, grey if unknown.
// (Boundary values keep the first matching band, as before.)
export const a1cBackground = (A1C) =>
  A1C >= 1.0 && A1C <= 5.6 ? 'rgba(0,0,255,0.50)'
    : A1C >= 5.6 && A1C <= 6.5 ? 'rgba(255,255,0,0.50)'
    : A1C >= 6.5 && A1C <= 7.5 ? 'rgba(0,255,0,0.50)'
    : A1C >= 7.5 && A1C <= 8.5 ? 'rgba(255,165,0,0.50)'
    : A1C >= 8.5 ? 'rgba(255,0,0,0.50)'
    : 'rgba(0,0,0,0.25)';

export const readingsPageSx = (A1C) => ({
  flex: '1 1 auto',
  minHeight: 0,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  backgroundColor: a1cBackground(A1C),
});

export const tableSx = {
  root: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,        // allows shrinking inside a flex parent
    overflow: 'hidden',
  },
  container: {
    flex: '1 1 auto',
    minHeight: 0,        // required, or the container grows instead of scrolling
    overflowY: 'auto',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    ...stickyFirstColSx,
    ...twoRowHeaderSx,
  },
};

// Backward-compatible hook wrapper, so existing `useTableStyles()` call
// sites keep working without touching every table file individually.
export function useTableStyles() {
  return tableSx;
}
