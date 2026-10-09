import React, { useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { getFetch } from '../../utils/api';
import { useAppContext } from '../../context/AppContext';

// Read-only list of what other church members shared (live from the server, never copied into
// this person's own library). There are deliberately no edit or delete buttons here, and the
// server has no route that could change another person's row.
export function useSharedLibrary() {
  const { state } = useAppContext();
  const userId = state.user.id;
  const [shared, setShared] = useState({ books: [], movies: [] });
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    getFetch(`/church/shared-library/${userId}`)
      .then((d) => { if (live) setShared({ books: d?.books || [], movies: d?.movies || [] }); })
      .catch(() => { /* no church, or sharing is off: nothing to show */ });
    return () => { live = false; };
  }, [userId]);
  return shared;
}

const box = { marginTop: 16 };
const row = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid #e0e0e0' };

function Row({ title, sub, by, church, available }) {
  return (
    <div style={row}>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{title}</Typography>
        {sub ? <Typography sx={{ fontSize: '0.75rem', color: '#555' }}>{sub}</Typography> : null}
        <Typography sx={{ fontSize: '0.75rem', color: '#1565c0' }}>
          {`${by} has it${church ? ` · ${church}` : ''}`}
        </Typography>
      </div>
      <Chip size="small" label={available ? 'In' : 'Out'} color={available ? 'primary' : 'secondary'} />
    </div>
  );
}

/** kind: 'books' | 'movies'. Shows nothing until something is typed in the search box. */
export default function SharedResults({ kind, search }) {
  const shared = useSharedLibrary();
  const q = (search || '').trim().toLowerCase();
  if (!q) return null;
  const hits = kind === 'books'
    ? shared.books.filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(q))
    : shared.movies.filter((m) => (m.name || '').toLowerCase().includes(q) || m.films.some((f) => f.name.toLowerCase().includes(q)));
  if (!hits.length) return null;
  return (
    <div style={box}>
      <Typography sx={{ fontWeight: 700, color: '#1565c0' }}>Shared by your church (view only)</Typography>
      {hits.map((h, i) => (kind === 'books'
        ? <Row key={i} title={h.title} sub={[h.author, h.year].filter(Boolean).join(' · ')} by={h.sharedBy} church={h.church} available={h.available} />
        : <Row key={i} title={h.name}
            sub={h.films.length > 1 ? h.films.map((f) => f.name).join(', ') : h.media}
            by={h.sharedBy} church={h.church} available={h.available} />))}
    </div>
  );
}
