import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// Shared pieces that keep edit / add dialogs compact so they fit the screen.
// Content only scrolls (inside the dialog, with the title and buttons pinned)
// when it is truly taller than the screen, e.g. a Box Set with many film tabs
// on a phone held sideways.
//
//   <FitDialog open onClose maxWidth="sm">
//     <DialogTitle>...</DialogTitle>
//     <FitContent>
//       <FieldGrid>            two columns (cols={3} gives three from 600 px up)
//         <TextField .../>     one cell
//         <Full><TextField/></Full>   spans the whole row
//       </FieldGrid>
//     </FitContent>
//     <DialogActions>...</DialogActions>
//   </FitDialog>

export function FitDialog({ PaperProps, ...rest }) {
  return (
    <Dialog
      fullWidth
      {...rest}
      PaperProps={{
        ...PaperProps,
        sx: {
          m: { xs: 1, sm: 2 },
          width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' },
          maxHeight: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' },
          '& .MuiDialogTitle-root': { py: 1.25, px: { xs: 2, sm: 3 }, fontSize: '1.1rem', lineHeight: 1.3 },
          '& .MuiDialogActions-root': { px: 2, py: 0.75 },
          ...(PaperProps && PaperProps.sx),
        },
      }}
    />
  );
}

// '&&' beats MUI's "no top padding after a title" rule, which clips the
// floating label of the first field.
export function FitContent({ sx, ...rest }) {
  return <DialogContent sx={{ '&&': { pt: 1 }, px: { xs: 2, sm: 3 }, py: 1, ...sx }} {...rest} />;
}

export function FieldGrid({ cols = 2, children }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(${cols}, minmax(0, 1fr))` },
        columnGap: 1.5,
        rowGap: 1.25,
        alignItems: 'start',
        '& > .MuiFormControl-root': { m: 0, width: '100%' },
      }}
    >
      {children}
    </Box>
  );
}

export function Full({ children, sx }) {
  return <Box sx={{ gridColumn: '1 / -1', minWidth: 0, ...sx }}>{children}</Box>;
}

// File picker with a small preview beside it (saves a whole row of height).
export function ImagePick({ label, src, onFile, inputKey }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.2, mb: 0.25 }}>
          {label}
        </Typography>
        <input
          key={inputKey}
          type="file"
          accept="image/*"
          style={{ maxWidth: '100%' }}
          onChange={(e) => onFile && onFile(e.target.files?.[0] || null)}
        />
      </Box>
      {src && (
        <img
          src={src}
          alt="preview"
          style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      )}
    </Box>
  );
}
