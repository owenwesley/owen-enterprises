/**
 * Shared "edit mode" visual treatment.
 *
 * Rule: whenever a user enters Edit Mode, the row being edited must be
 * unmistakably obvious. These tokens are applied by every table so the
 * signal is identical everywhere:
 *
 *   - tinted background so the active row separates from the rest
 *   - a saturated left accent bar marking where the edit begins
 *   - a top/bottom outline so the row's full extent is visible
 *   - extra vertical padding so inputs (which are taller than plain text)
 *     don't feel cramped — this is the "expansion" cue
 */

export const EDIT_ACCENT = '#1a237e';

export const editingRowSx = {
  backgroundColor: 'rgba(26, 35, 126, 0.08)',
  boxShadow: `inset 4px 0 0 0 ${EDIT_ACCENT}`,
  outline: `1px solid rgba(26, 35, 126, 0.35)`,
  outlineOffset: '-1px',
};

export const editingCellSx = {
  paddingTop: '14px',
  paddingBottom: '14px',
  verticalAlign: 'middle',
};

/**
 * Banner shown above a table while a row is being edited, so the mode is
 * clear even if the active row has scrolled out of view in a long table.
 */
export const editBannerSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  px: 1.5,
  py: 0.75,
  backgroundColor: 'rgba(26, 35, 126, 0.10)',
  borderLeft: `4px solid ${EDIT_ACCENT}`,
  color: EDIT_ACCENT,
  fontWeight: 700,
  fontSize: '0.85rem',
};
