import React, { useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import SettingsIcon from '@mui/icons-material/Settings';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BusinessIcon from '@mui/icons-material/Business';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import LogoutIcon from '@mui/icons-material/Logout';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';

import { useAppContext } from '../../context/AppContext';
import DeleteAccountDialog from './DeleteAccountDialog';

const FEATURES = [
  { key: 'bgtracker',        prefKey: 'chkBgtracker',        label: 'BG Tracker' },
  { key: 'communityLibrary', prefKey: 'chkCommunityLibrary', label: 'Community Library' },
  { key: 'meetings',         prefKey: 'chkMeetings',         label: 'Meetings' },
];

// Upper-right account menu: replaces the separate My doctors / Profile /
// Feature access icons and the Logout button. `compact` (phones) shows only
// the avatar. Which entries appear depends on the role, as before:
//   patient: My doctors (BG Tracker on), Switch feature, Delete my account
//   doctor : Doctor home, My clinic
//   admin  : Doctor approvals
// Everyone: My profile, Feature access, Log out.
export default function AccountMenu({ compact = false }) {
  const { state, dispatch } = useAppContext();
  const { user, activeFeature, featurePreferences } = state;
  const history = useHistory();
  const [anchor, setAnchor] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const close = () => setAnchor(null);
  const initials = `${(user.firstName || '?')[0]}${(user.lastName || '')[0] || ''}`.toUpperCase();
  const isPatient = user.role === 'patient';
  const enabled = FEATURES.filter((f) => featurePreferences[f.prefKey] === 1);

  const switchTo = (key) => {
    close();
    dispatch({ type: 'SET_FEATURE', payload: key });
    history.push('/');
  };

  // MUI Menu keeps its children as direct items; each link item is a router Link.
  const linkItem = (to, icon, text) => (
    <MenuItem key={to} component={Link} to={to} onClick={close}>
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText>{text}</ListItemText>
    </MenuItem>
  );

  const avatar = (
    <Avatar sx={{ width: 28, height: 28, fontSize: 13, bgcolor: 'rgba(255,255,255,0.25)', color: '#fff' }}>
      {initials}
    </Avatar>
  );

  return (
    <>
      {compact ? (
        <IconButton edge="end" sx={{ color: '#fff' }} aria-label="Account menu" aria-haspopup="menu"
          aria-expanded={Boolean(anchor)} onClick={(e) => setAnchor(e.currentTarget)}>
          {avatar}
        </IconButton>
      ) : (
        <Button color="inherit" size="small" aria-label="Account menu" aria-haspopup="menu"
          aria-expanded={Boolean(anchor)} onClick={(e) => setAnchor(e.currentTarget)}
          startIcon={avatar} endIcon={<ArrowDropDownIcon />}
          sx={{ ml: 1, flexShrink: 0, whiteSpace: 'nowrap', textTransform: 'none' }}>
          {user.firstName}
        </Button>
      )}

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 230, maxWidth: '90vw' } } }}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography sx={{ fontWeight: 700 }} noWrap>{user.firstName} {user.lastName}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'capitalize' }}>{user.role}</Typography>
        </Box>
        <Divider />

        {linkItem('/profile', <AccountCircleIcon fontSize="small" />, 'My profile')}
        {isPatient && featurePreferences.chkBgtracker === 1 &&
          linkItem('/my-doctors', <LocalHospitalIcon fontSize="small" />, 'My doctors')}
        {user.role === 'doctor' && linkItem('/doctor', <DashboardIcon fontSize="small" />, 'Doctor home')}
        {user.role === 'doctor' && linkItem('/doctor/clinic', <BusinessIcon fontSize="small" />, 'My clinic')}
        {user.role === 'admin' && linkItem('/admin', <FactCheckIcon fontSize="small" />, 'Doctor approvals')}
        {linkItem('/feature-preferences', <SettingsIcon fontSize="small" />, 'Feature access')}

        {isPatient && enabled.length > 0 && <Divider />}
        {isPatient && enabled.length > 0 && <ListSubheader sx={{ lineHeight: '32px' }}>Switch feature</ListSubheader>}
        {isPatient && enabled.map((f) => (
          <MenuItem key={f.key} selected={activeFeature === f.key} onClick={() => switchTo(f.key)}>
            <ListItemText inset>{f.label}</ListItemText>
          </MenuItem>
        ))}

        <Divider />
        <MenuItem onClick={() => { close(); dispatch({ type: 'RESET' }); }}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Log out</ListItemText>
        </MenuItem>

        {isPatient && <Divider />}
        {isPatient && (
          <MenuItem onClick={() => { close(); setConfirmOpen(true); }} sx={{ color: 'error.main' }}>
            <ListItemIcon sx={{ color: 'error.main' }}><DeleteForeverIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Delete my account</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <DeleteAccountDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} />
    </>
  );
}
