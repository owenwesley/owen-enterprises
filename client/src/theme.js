import { createTheme } from '@mui/material/styles';

// Mobile-first tweaks applied app-wide. Everything here lives inside a
// max-width media query, so desktop rendering is unchanged.
const NARROW = '@media (max-width:899.95px)';
const PHONE  = '@media (max-width:599.95px)';

const theme = createTheme({
  components: {
    MuiTableCell: {
      styleOverrides: {
        root: {
          [NARROW]: {
            padding: '8px 6px',
            fontSize: '0.8125rem',
            // Bare edit / save / delete icons sitting directly in a cell:
            // grow the tap area to ~40px without changing the layout much.
            '& > svg.MuiSvgIcon-root': {
              boxSizing: 'content-box',
              fontSize: '1.6rem',
              padding: 6,
              borderRadius: '50%',
            },
          },
        },
        sizeSmall: { [NARROW]: { padding: '6px 5px' } },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          [PHONE]: { margin: 12, width: 'calc(100% - 24px)', maxHeight: 'calc(100% - 24px)' },
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: { root: { [PHONE]: { paddingLeft: 16, paddingRight: 16 } } },
    },
    MuiDialogActions: {
      styleOverrides: { root: { [PHONE]: { padding: '8px 16px 16px' } } },
    },
    MuiIconButton: {
      styleOverrides: { sizeSmall: { '@media (pointer: coarse)': { padding: 10 } } },
    },
    MuiButton: {
      styleOverrides: { root: { '@media (pointer: coarse)': { minHeight: 40 } } },
    },
  },
});

export default theme;
