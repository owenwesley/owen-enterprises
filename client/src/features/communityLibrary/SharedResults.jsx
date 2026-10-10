import React, { useCallback, useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardMedia from '@mui/material/CardMedia';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import { getFetch, postFetch } from '../../utils/api';
import { useAppContext } from '../../context/AppContext';
import { placeholderImage } from '../../utils/mediaImages';

// Read-only cards of what other church members shared (live from the server, never copied into
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

// ── Borrow requests (asked and received) ──────────────────────────────────────
export function useBorrow(onChange) {
  const { state } = useAppContext();
  const userId = state.user.id;
  const [data, setData] = useState({ incoming: [], outgoing: [] });
  const load = useCallback(() => {
    if (!userId) return Promise.resolve();
    return getFetch(`/church/borrow/${userId}`)
      .then((d) => {
        setData({ incoming: d?.incoming || [], outgoing: d?.outgoing || [] });
        try { window.dispatchEvent(new Event('oe:borrow-changed')); } catch { /* non-browser */ }   // refresh the nav badge
      })
      .catch(() => { /* no church: nothing to show */ });
  }, [userId]);
  useEffect(() => { load(); }, [load]);
  return {
    ...data,
    reload: load,
    request: async (kind, ref, note) => {
      const r = await postFetch(`/church/borrow/request/${userId}`, { kind, ref, note });
      await load();
      return r;
    },
    // A Yes marks the item Out on the server, so the owner's own list is refreshed through onChange.
    accept: async (id) => { try { await postFetch(`/church/borrow/answer/${userId}`, { id, accept: true }); } finally { await load(); if (onChange) onChange(); } },
    decline: async (id) => { await postFetch(`/church/borrow/answer/${userId}`, { id, accept: false }); await load(); },
    cancel: async (id) => { await postFetch(`/church/borrow/cancel/${userId}`, { id }); await load(); },
    clear: async (id) => { await postFetch(`/church/borrow/clear/${userId}`, { id }); await load(); },
  };
}

const statusColor = { pending: 'default', accepted: 'primary', declined: 'secondary', expired: 'default' };

/** Requests other members sent you (answer them) and requests you sent (cancel or clear them). */
export function BorrowRequests({ borrow }) {
  const { incoming, outgoing } = borrow;
  if (!incoming.length && !outgoing.length) return null;
  const line = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid #e0e0e0' };
  return (
    <div style={{ marginTop: 16 }}>
      {incoming.length > 0 && (
        <>
          <Typography sx={{ fontWeight: 700, color: '#1565c0' }}>Requests to borrow yours</Typography>
          {incoming.map((r) => (
            <div key={`i${r.id}`} style={line}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{`${r.from} would like to borrow "${r.title}"`}</Typography>
                {r.note ? <Typography sx={{ fontSize: '0.75rem', color: '#555' }}>{r.note}</Typography> : null}
              </div>
              {r.status === 'pending' ? (
                <>
                  <Button size="small" variant="contained" onClick={() => borrow.accept(r.id)}>Yes</Button>
                  <Button size="small" onClick={() => borrow.decline(r.id)}>No</Button>
                </>
              ) : (
                <>
                  <Chip size="small" label={r.status === 'accepted' ? 'Yes - marked Out' : (r.auto ? 'Closed' : 'You said no')} color={statusColor[r.status]} />
                  <Button size="small" onClick={() => borrow.clear(r.id)}>Clear</Button>
                </>
              )}
            </div>
          ))}
        </>
      )}
      {outgoing.length > 0 && (
        <>
          <Typography sx={{ fontWeight: 700, color: '#1565c0', marginTop: 1 }}>Your requests</Typography>
          {outgoing.map((r) => (
            <div key={`o${r.id}`} style={line}>
              <Typography sx={{ flex: '1 1 200px', minWidth: 0, fontSize: '0.9rem' }}>{`"${r.title}" from ${r.to}`}</Typography>
              <Chip size="small" color={statusColor[r.status]}
                label={r.status === 'pending' ? 'Waiting' : r.status === 'accepted' ? 'Yes' : r.status === 'expired' ? 'No answer - expired' : (r.auto ? 'Taken' : 'No')} />
              {r.status === 'pending'
                ? <Button size="small" onClick={() => borrow.cancel(r.id)}>Cancel</Button>
                : <Button size="small" onClick={() => borrow.clear(r.id)}>Clear</Button>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const grid = { display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8 };
const cardSx = { width: 'calc(50% - 8px)', maxWidth: 160, display: 'flex', flexDirection: 'column', position: 'relative' };

// Picture paths come from the owner's row. Tidy them (missing leading slash, spaces) and, if one
// fails to load, try the next candidate, then the stock "no cover" picture, then a plain title tile.
const fixPath = (u) => {
  const t = String(u || '').trim();
  if (!t) return '';
  if (/^(https?:)?\/\//i.test(t) || t.startsWith('data:')) return t;
  return encodeURI(decodeURI(t.startsWith('/') ? t : `/${t}`));
};

function Cover({ srcs, alt, kind }) {
  const list = [...srcs.map(fixPath).filter(Boolean), placeholderImage(kind)]
    .filter((u, i, a) => a.indexOf(u) === i);
  const key = list.join('|');
  const [tried, setTried] = useState(0);
  useEffect(() => { setTried(0); }, [key]);
  if (tried >= list.length) {
    return (
      <div style={{ height: 200, background: '#eceff1', color: '#78909c', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 8, fontSize: '0.8rem' }}>
        {alt}
      </div>
    );
  }
  return <CardMedia key={list[tried]} component="img" sx={{ height: 200, objectFit: 'cover' }} image={list[tried]} alt={alt} onError={() => setTried((n) => n + 1)} />;
}

export function ShareCard({ kind, item, title, sub, borrow, onAsk, canAsk = true, isYou = false }) {
  const pending = borrow.outgoing.some((r) => r.status === 'pending' && r.kind === kind && r.title === title && r.to === item.sharedBy);
  return (
    <Card sx={cardSx} elevation={3}>
      <Cover srcs={[item.img, ...(item.films || []).map((f) => f.img)]} alt={title} kind={kind} />
      <span style={{ position: 'absolute', top: 8, right: 8 }}>
        <Chip size="small" label={item.available ? 'In' : 'Out'} color={item.available ? 'primary' : 'secondary'} />
      </span>
      <CardContent style={{ padding: '8px 10px', flexGrow: 1 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2 }}>{title}</Typography>
        {sub ? <Typography sx={{ fontSize: '0.75rem', color: '#555' }}>{sub}</Typography> : null}
      </CardContent>
      <div style={{ padding: '6px 10px', borderTop: '1px solid #e0e0e0', background: '#f5f9ff' }}>
        <Typography sx={{ fontSize: '0.72rem', color: '#1565c0', fontWeight: 600 }}>{isYou ? 'Owned by you' : `Owned by ${item.sharedBy}`}</Typography>
        {item.church ? <Typography sx={{ fontSize: '0.68rem', color: '#555' }}>{item.church}</Typography> : null}
      </div>
      {!isYou && canAsk && <CardActions style={{ padding: '4px' }}>
        <Button size="small" fullWidth disabled={pending || !item.available} onClick={() => onAsk({ kind, ref: item.ref, title, owner: item.sharedBy })}>
          {pending ? 'Requested' : item.available ? 'Ask to borrow' : 'Out right now'}
        </Button>
      </CardActions>}
    </Card>
  );
}

export function AskDialog({ ask, onClose, onSend }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(''); setBusy(false); }, [ask]);
  if (!ask) return null;
  const send = async () => {
    setBusy(true);
    const r = await onSend(ask, note);
    setBusy(false);
    if (r && !r.error) onClose();
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{`Ask ${ask.owner} to borrow "${ask.title}"?`}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth multiline minRows={2} margin="dense" label="Message (optional)"
          value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy} onClick={send}>Send request</Button>
      </DialogActions>
    </Dialog>
  );
}

/** kind: 'books' | 'movies'. Shows nothing until something is typed in the search box
 *  (answered requests still show, so the owner can always see who asked). */
export default function SharedResults({ kind, search, onOwnChanged }) {
  const shared = useSharedLibrary();
  const borrow = useBorrow(onOwnChanged);
  const [ask, setAsk] = useState(null);
  const q = (search || '').trim().toLowerCase();
  const one = kind === 'books' ? 'book' : 'movie';
  const hits = !q ? [] : kind === 'books'
    ? shared.books.filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(q))
    : shared.movies.filter((m) => (m.name || '').toLowerCase().includes(q) || m.films.some((f) => f.name.toLowerCase().includes(q)));
  const mine = {
    incoming: borrow.incoming.filter((r) => r.kind === one),
    outgoing: borrow.outgoing.filter((r) => r.kind === one),
  };
  const send = (a, note) => borrow.request(a.kind, a.ref, note);
  return (
    <>
      {hits.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Typography sx={{ fontWeight: 700, color: '#1565c0' }}>Shared by your church</Typography>
          <div style={grid}>
            {hits.map((h) => (kind === 'books'
              ? <ShareCard key={`b${h.ref}`} kind="book" item={h} title={h.title}
                  sub={[h.author, h.year].filter(Boolean).join(' · ')} borrow={borrow} onAsk={setAsk} />
              : <ShareCard key={`m${h.ref}`} kind="movie" item={h} title={h.name}
                  sub={h.films.length > 1 ? h.films.map((f) => f.name).join(', ') : h.media} borrow={borrow} onAsk={setAsk} />))}
          </div>
        </div>
      )}
      <BorrowRequests borrow={{ ...borrow, ...mine }} />
      <AskDialog ask={ask} onClose={() => setAsk(null)} onSend={send} />
    </>
  );
}
