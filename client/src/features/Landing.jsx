import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Badge from '@mui/material/Badge';
import { useAppContext } from '../context/AppContext';
import { useBorrowBadge } from '../hooks/useBorrowBadge';

const sxStyles = {
  // Fills exactly the space the app shell gives it (viewport minus the app bar)
  // and scrolls internally when the content is taller. `minHeight: 0` is what
  // lets a flex child shrink below its content size so overflowY can engage.
  wrapper: {
    flex: '1 1 auto',
    minHeight: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
    padding: { xs: '24px 16px', sm: '32px 24px' },
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  // `my: 'auto'` centers the content vertically when there is spare room, but
  // (unlike justifyContent: 'center') never pushes the top out of reach when
  // the content is taller than the wrapper.
  inner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    my: 'auto',
  },
  title: {
    color: '#fff',
    fontWeight: 700,
    fontSize: { xs: '1.8rem', sm: '2.4rem' },
    marginBottom: 1,
    letterSpacing: 2,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    marginBottom: { xs: 3, sm: 5 },
    fontSize: { xs: '0.95rem', sm: '1.1rem' },
    textAlign: 'center',
  },
  grid: {
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: '1000px',
    width: '100%',
  },
  card: {
    width: { xs: '100%', sm: 240, md: 260 },
    maxWidth: 320,
    borderRadius: 4,
    transition: 'transform 0.2s, box-shadow 0.2s',
    '&:hover': {
      transform: 'translateY(-6px)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
    },
  },
  cardInner: {
    padding: { xs: '20px 16px', sm: '28px 20px' },
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1.5,
  },
  icon: { fontSize: '3rem' },
  cardTitle: { fontWeight: 700, fontSize: '1.1rem', textAlign: 'center' },
  cardDesc: { color: '#666', textAlign: 'center', fontSize: '0.85rem' },
};

const ALL_FEATURES = [
  {
    key: 'bgtracker',
    prefKey: 'chkBgtracker',
    icon: '🩸',
    title: 'BG Tracker',
    desc: 'Blood glucose, blood pressure, medications, weight & A1C charts',
    bg: '#e3f2fd',
  },
  {
    key: 'communityLibrary',
    prefKey: 'chkCommunityLibrary',
    icon: '📚',
    title: 'Community Library',
    desc: 'Manage the book and movie collection — track who has what',
    bg: '#e8f5e9',
  },
  {
    key: 'meetings',
    prefKey: 'chkMeetings',
    icon: '🤝',
    title: 'Meetings',
    desc: 'NA / AA meeting records, chips, medallions and running balance',
    bg: '#fff3e0',
  },
  {
    key: 'church',
    prefKey: 'chkChurch',
    icon: '⛪',
    title: 'Church',
    desc: 'Join your church, see its members and mission statement',
    bg: '#f3e5f5',
  },
];

export default function Landing() {
  const { state, dispatch } = useAppContext();
  const borrowBadge = useBorrowBadge();

  // Only show features the user is enabled for
  const { featurePreferences } = state;
  const features = ALL_FEATURES.filter((f) => featurePreferences[f.prefKey] === 1);

  return (
    <Box sx={sxStyles.wrapper}>
      <Box sx={sxStyles.inner}>
        <Typography sx={sxStyles.title}>
          Welcome{state.user.firstName ? `, ${state.user.firstName}` : ''}
        </Typography>
        <Typography sx={sxStyles.subtitle}>
          Select a feature to get started
        </Typography>
        <div style={sxStyles.grid}>
          {features.map((f) => (
            <Card key={f.key} sx={sxStyles.card} style={{ background: f.bg }} elevation={4}>
              <CardActionArea onClick={() => dispatch({ type: 'SET_FEATURE', payload: f.key })}>
                <CardContent sx={sxStyles.cardInner}>
                  {f.key === 'communityLibrary' && borrowBadge.total > 0 ? (
                    <Badge badgeContent={borrowBadge.total} color="error" max={99}
                      aria-label={`${borrowBadge.total} borrow request(s) waiting`}>
                      <span style={sxStyles.icon}>{f.icon}</span>
                    </Badge>
                  ) : <span style={sxStyles.icon}>{f.icon}</span>}
                  <Typography sx={sxStyles.cardTitle}>{f.title}</Typography>
                  <Typography sx={sxStyles.cardDesc}>{f.desc}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </div>
      </Box>
    </Box>
  );
}
