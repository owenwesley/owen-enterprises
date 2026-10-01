import React from 'react';
import Typography from '@mui/material/Typography';

/**
 * Discreet, fixed-position brand tag shown in the bottom-right corner of
 * every page. Sits above page content but stays out of the way — small,
 * low-contrast, non-interactive.
 */
export default function BrandFooter() {
  return (
    <Typography
      sx={{
        position: 'fixed',
        bottom: 8,
        right: 12,
        fontSize: '0.7rem',
        color: 'rgba(0,0,0,0.35)',
        display: { xs: 'none', sm: 'block' },
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 1, // stays below MUI dialogs, menus, and app bar (all use higher theme z-index tiers)
      }}
    >
      OwenEnterprises
    </Typography>
  );
}
