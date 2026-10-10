import React, { useEffect, useState, useCallback } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import MenuItem from '@mui/material/MenuItem';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContentText from '@mui/material/DialogContentText';
import { FitDialog, FitContent } from '../../components/DialogFit';
import { useChurch } from './hooks/useChurch';
import { ShareCard, AskDialog, useBorrow, BorrowRequests } from '../communityLibrary/SharedResults';

// Layout rule: the page itself never scrolls. This fills .app-content; the
// header (title, church picker, tabs) and the footer buttons stay put and only
// the middle part scrolls. px STRINGS in sx (plain numbers are theme units).
const sxStyles = {
  root:   { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', maxWidth: '720px', width: '100%', margin: '0 auto', padding: '12px', boxSizing: 'border-box' },
  head:   { flex: '0 0 auto' },
  title:  { fontWeight: 700, color: '#1a237e', fontSize: '1.3rem' },
  body:   { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '12px 0' },
  foot:   { flex: '0 0 auto', display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '8px 0 0' },
  card:   { padding: '16px', borderRadius: '12px', marginBottom: '12px' },
  label:  { color: '#666', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' },
  mission:{ whiteSpace: 'pre-wrap', marginTop: '4px' },
  code:   { fontFamily: 'monospace', fontSize: '1.4rem', fontWeight: 700, letterSpacing: '4px', color: '#1a237e' },
  row:    { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid #eee', flexWrap: 'wrap' },
  primary:{ backgroundColor: '#1a237e', color: '#fff', '&:hover': { backgroundColor: '#283593' } },
};

const STATUS_TEXT = {
  pending:   'This church is waiting for approval. You will be able to use it once it is approved.',
  rejected:  'This church request was not approved.',
  suspended: 'This church is suspended.',
};

const ROLE_LABEL = { owner: 'Owner', leader: 'Leader', treasurer: 'Treasurer', missions: 'Mission leader', member: 'Member' };
const ROLE_CHOICES = ['member', 'leader', 'treasurer', 'missions'];

export default function ChurchPage() {
  const {
    churches, loaded, loadChurches, createChurch, joinChurch, getMembers,
    approveMember, removeMember, saveMission, leaveChurch,
    resetJoinCode, transferChurch, setShareLibrary, setShareContact, getCatalog,
    getAnnouncements, postAnnouncement, editAnnouncement, deleteAnnouncement, setRole, setAreas,
  } = useChurch();

  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState(0);
  const [members, setMembers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const borrow = useBorrow();
  const [ask, setAsk] = useState(null);
  const [news, setNews] = useState([]);
  const [fTitle, setFTitle] = useState('');
  const [fBody, setFBody] = useState('');
  const [editing, setEditing] = useState(null);   // announcement being edited, or null for a new one
  const [fMember, setFMember] = useState('');
  const [fPassword, setFPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [dialog, setDialog] = useState(null);   // 'create' | 'join' | 'mission' | 'leave' | 'resetCode' | 'transfer'
  const [fName, setFName] = useState('');
  const [fMission, setFMission] = useState('');
  const [fCode, setFCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cPhone, setCPhone] = useState('');
  const [cAddress, setCAddress] = useState('');

  useEffect(() => { loadChurches(); }, [loadChurches]);

  // Keep a valid church selected whenever the list changes.
  useEffect(() => {
    if (!churches.length) { setSelectedId(null); return; }
    if (!churches.some((c) => c.churchId === selectedId)) setSelectedId(churches[0].churchId);
  }, [churches, selectedId]);

  const church = churches.find((c) => c.churchId === selectedId) || null;
  const isOwner = !!church && church.role === 'owner';
  const working = !!church && church.churchStatus === 'approved' && church.memberStatus === 'active';
  // What this person may do comes from the server (church.permissions), never from the role name.
  const can = (p) => !!church && (church.permissions || []).includes(p);
  const areas = (church && church.areas) || { announcements: true, library: true, contacts: true };
  const closedNote = <Typography sx={{ color: '#666' }}>The church owner has turned this off.</Typography>;

  const refreshMembers = useCallback(async () => {
    if (church && working) setMembers(await getMembers(church.churchId));
    else setMembers([]);
  }, [church, working, getMembers]);

  const refreshCatalog = useCallback(async () => {
    if (church && working) setCatalog(await getCatalog(church.churchId));
    else setCatalog([]);
  }, [church, working, getCatalog]);

  const refreshNews = useCallback(async () => {
    if (church && working) setNews(await getAnnouncements(church.churchId));
    else setNews([]);
  }, [church, working, getAnnouncements]);

  // Tabs: 0 Overview, 1 Announcements, 2 Members, 3 Sharing.
  useEffect(() => { if (tab === 1) refreshNews(); }, [tab, refreshNews]);
  useEffect(() => { if (tab === 2) refreshMembers(); }, [tab, refreshMembers]);
  useEffect(() => { if (tab === 3) refreshCatalog(); }, [tab, refreshCatalog]);
  useEffect(() => { setTab(0); }, [selectedId]);
  // Fill the contact fields from what the server holds whenever the church (or its saved values) changes.
  useEffect(() => {
    setCPhone(church ? church.contactPhone || '' : '');
    setCAddress(church ? church.contactAddress || '' : '');
  }, [church && church.churchId, church && church.contactPhone, church && church.contactAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (name) => { setFTitle(''); setFBody(''); setEditing(null); setFName(''); setFMission(church && name === 'mission' ? church.missionStatement : ''); setFCode(''); setFMember(''); setFPassword(''); setDialog(name); };
  const close = () => { if (!busy) setDialog(null); };

  // Runs an action; shows the server's message (or error) and closes the dialog on success.
  const run = async (fn, okMessage) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res || res.error) return false;       // the shared toast already showed the error
    setMsg(res.message || okMessage);
    setDialog(null);
    return true;
  };

  const onCreate = () => run(() => createChurch(fName.trim(), fMission.trim()), 'Church requested');
  const onJoin = () => run(() => joinChurch(fCode.trim()), 'Request sent');
  const onMission = () => run(() => saveMission(church.churchId, fMission.trim()), 'Saved');
  const onResetCode = () => run(() => resetJoinCode(church.churchId), 'New join code created');
  const onTransfer = () => run(() => transferChurch(church.churchId, Number(fMember), fPassword), 'Church handed over');
  const onShare = async (checked) => {
    const r = await setShareLibrary(church.churchId, checked);
    if (r && !r.error) { setMsg(r.message); if (tab === 3) refreshCatalog(); }
  };
  const onShareContact = async (share) => {
    const r = await setShareContact(church.churchId, share, cPhone.trim(), cAddress.trim());
    if (r && !r.error) setMsg(r.message);
  };
  const openNews = (a) => {
    setFName(''); setFMission(''); setFCode(''); setFMember(''); setFPassword('');
    setEditing(a || null); setFTitle(a ? a.title : ''); setFBody(a ? a.body : ''); setDialog('news');
  };
  const onSaveNews = async () => {
    const ok = await run(() => (editing
      ? editAnnouncement(church.churchId, editing.announcementId, fTitle.trim(), fBody.trim())
      : postAnnouncement(church.churchId, fTitle.trim(), fBody.trim())), 'Saved');
    if (ok) refreshNews();
  };
  const onDeleteNews = async (a) => {
    const r = await deleteAnnouncement(church.churchId, a.announcementId);
    if (r && !r.error) { setMsg(r.message); refreshNews(); }
  };
  const onRole = async (m, role) => {
    const r = await setRole(church.churchId, m.memberId, role);
    if (r && !r.error) { setMsg(`${m.name}: ${ROLE_LABEL[role]}`); refreshMembers(); }
  };
  const onArea = async (key, on) => {
    const r = await setAreas(church.churchId, { [key]: on });
    if (r && !r.error) { setMsg(r.message); if (tab === 3) refreshCatalog(); }
  };
  const onLeave = () => run(() => leaveChurch(church.churchId), 'You left the church');

  const onApprove = async (m) => { const r = await approveMember(church.churchId, m.memberId); if (r && !r.error) { setMsg(`${m.name} approved`); refreshMembers(); loadChurches(); } };
  const onRemove = async (m) => { const r = await removeMember(church.churchId, m.memberId); if (r && !r.error) { setMsg(`${m.name} removed`); refreshMembers(); loadChurches(); } };

  if (!loaded) return <div style={{ padding: 24 }}>Loading…</div>;

  // ── no church yet ──────────────────────────────────────────────────────────
  const startOrJoin = (
    <Paper sx={sxStyles.card} elevation={2}>
      <Typography sx={sxStyles.title}>{church ? 'Another church' : 'Church'}</Typography>
      <Typography sx={{ color: '#555', margin: '4px 0 12px' }}>
        Join your church with the code its owner gives you, or ask to set up a new one.
        A new church is checked and approved before it can be used.
      </Typography>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="contained" sx={sxStyles.primary} onClick={() => open('join')}>Join with a code</Button>
        <Button variant="outlined" onClick={() => open('create')}>Request a new church</Button>
      </div>
    </Paper>
  );

  return (
    <div style={sxStyles.root}>
      <div style={sxStyles.head}>
        {church && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Typography sx={{ ...sxStyles.title, flex: '1 1 auto', minWidth: 0 }} noWrap>{church.name}</Typography>
              {churches.length > 1 && (
                <TextField select size="small" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} sx={{ minWidth: '160px' }} aria-label="Switch church">
                  {churches.map((c) => <MenuItem key={c.churchId} value={c.churchId}>{c.name}</MenuItem>)}
                </TextField>
              )}
            </div>
            {working && (
              <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ minHeight: '40px' }}>
                <Tab label="Overview" sx={{ minHeight: '40px' }} />
                <Tab label="Announcements" sx={{ minHeight: '40px' }} />
                <Tab label={church.pendingMembers ? `Members (${church.pendingMembers} waiting)` : 'Members'} sx={{ minHeight: '40px' }} />
                <Tab label="Sharing" sx={{ minHeight: '40px' }} />
              </Tabs>
            )}
          </>
        )}
      </div>

      <div style={sxStyles.body}>
        {!church && startOrJoin}

        {church && !working && (
          <Alert severity={church.churchStatus === 'approved' ? 'info' : 'warning'} sx={{ marginBottom: '12px' }}>
            {church.churchStatus !== 'approved'
              ? STATUS_TEXT[church.churchStatus]
              : 'Your request to join is waiting for the church owner to approve it.'}
          </Alert>
        )}

        {church && working && tab === 0 && (
          <>
            <Paper sx={sxStyles.card} elevation={2}>
              <Typography sx={sxStyles.label}>Mission statement</Typography>
              <Typography sx={sxStyles.mission}>
                {church.missionStatement || (isOwner ? 'No mission statement yet. Use Edit mission below.' : 'No mission statement yet.')}
              </Typography>
            </Paper>
            {isOwner && (
              <Paper sx={sxStyles.card} elevation={2}>
                <Typography sx={sxStyles.label}>Join code</Typography>
                <Typography sx={sxStyles.code}>{church.joinCode}</Typography>
                <Typography sx={{ color: '#666', fontSize: '0.85rem' }}>
                  Give this code to the people you want to invite. They are not added until you approve them on the Members tab.
                  If the code gets out, make a new one: the old code stops working at once.
                </Typography>
              </Paper>
            )}
            {startOrJoin}
          </>
        )}

        {church && working && tab === 1 && (
          <>
            {!areas.announcements && <Paper sx={sxStyles.card} elevation={2}>{closedNote}</Paper>}
            {areas.announcements && news.length === 0 && (
              <Paper sx={sxStyles.card} elevation={2}>
                <Typography sx={{ color: '#666' }}>No announcements yet.</Typography>
              </Paper>
            )}
            {areas.announcements && news.map((a) => (
              <Paper key={a.announcementId} sx={sxStyles.card} elevation={2}>
                <Typography sx={{ fontWeight: 700, color: '#1a237e' }}>{a.title}</Typography>
                <Typography sx={{ color: '#666', fontSize: '0.8rem' }}>
                  {a.author} · {new Date(a.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}{a.edited ? ' (edited)' : ''}
                </Typography>
                {a.body && <Typography sx={{ whiteSpace: 'pre-wrap', marginTop: '8px' }}>{a.body}</Typography>}
                {can('announcements.post') && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <Button size="small" onClick={() => openNews(a)}>Edit</Button>
                    <Button size="small" color="error" onClick={() => onDeleteNews(a)}>Delete</Button>
                  </div>
                )}
              </Paper>
            ))}
          </>
        )}

        {church && working && tab === 2 && (
          <Paper sx={sxStyles.card} elevation={2}>
            {members.length === 0 && <Typography sx={{ color: '#666' }}>No members to show.</Typography>}
            {members.map((m) => (
              <div key={m.memberId} style={sxStyles.row}>
                <Typography sx={{ flex: '1 1 auto', minWidth: 0, fontWeight: m.isYou ? 700 : 400 }} noWrap>
                  {m.name}{m.isYou ? ' (you)' : ''}
                </Typography>
                {m.role === 'owner' && <Chip size="small" label="Owner" color="primary" />}
                {m.role !== 'owner' && m.role !== 'member' && !can('members.roles') && <Chip size="small" label={ROLE_LABEL[m.role] || m.role} color="secondary" />}
                {can('members.roles') && m.role !== 'owner' && m.status === 'active' && !m.isYou && (
                  <TextField select size="small" value={m.role} onChange={(e) => onRole(m, e.target.value)}
                    sx={{ minWidth: '130px' }} inputProps={{ 'aria-label': `Role for ${m.name}` }}>
                    {ROLE_CHOICES.map((r) => <MenuItem key={r} value={r}>{ROLE_LABEL[r]}</MenuItem>)}
                  </TextField>
                )}
                {m.status === 'pending' && <Chip size="small" label="Waiting" color="warning" />}
                {can('members.manage') && m.status === 'pending' && (
                  <Button size="small" variant="contained" sx={sxStyles.primary} onClick={() => onApprove(m)}>Approve</Button>
                )}
                {can('members.manage') && (isOwner ? m.role !== 'owner' : m.role === 'member') && (
                  <Button size="small" color="error" onClick={() => onRemove(m)}>{m.status === 'pending' ? 'Decline' : 'Remove'}</Button>
                )}
              </div>
            ))}
          </Paper>
        )}

        {church && working && tab === 3 && (
          <>
            {isOwner && (
              <Paper sx={sxStyles.card} elevation={2}>
                <Typography sx={sxStyles.label}>Church areas (owner)</Typography>
                <Typography sx={{ color: '#666', fontSize: '0.85rem', marginBottom: '4px' }}>
                  Turn an area off to close it for everyone in this church, you included. Turning off Library or Contacts also
                  switches every member's sharing off and erases the phone numbers and addresses; turning it on again shares nothing until each person opts in.
                  Announcements are only hidden, not deleted.
                </Typography>
                {[['announcements', 'Announcements'], ['library', 'Library'], ['contacts', 'Contacts']].map(([k, label]) => (
                  <div key={k}>
                    <FormControlLabel
                      control={<Switch id={`area-${k}`} checked={!!areas[k]} onChange={(e) => onArea(k, e.target.checked)} />}
                      label={label}
                      htmlFor={`area-${k}`}
                    />
                  </div>
                ))}
              </Paper>
            )}
            <Paper sx={sxStyles.card} elevation={2}>
              {!areas.contacts ? closedNote : (<>
              <FormControlLabel
                control={<Switch id="share-contact" checked={!!church.shareContact} onChange={(e) => onShareContact(e.target.checked)} />}
                label="Share my contact info with this church"
                htmlFor="share-contact"
              />
              <Typography sx={{ color: '#666', fontSize: '0.85rem', marginBottom: '8px' }}>
                Off by default. When on, other members of this church see your name and your account email in their Contacts page,
                plus the phone and address you type below (both optional). They are not copied: if you leave, are removed, or switch
                this off, you disappear from their Contacts and the phone and address are erased.
              </Typography>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField size="small" label="Phone (optional)" value={cPhone} onChange={(e) => setCPhone(e.target.value)} inputProps={{ maxLength: 50, id: 'contact-phone' }} sx={{ flex: '1 1 160px' }} />
                <TextField size="small" label="Address (optional)" value={cAddress} onChange={(e) => setCAddress(e.target.value)} inputProps={{ maxLength: 500, id: 'contact-address' }} sx={{ flex: '2 1 240px' }} />
                {church.shareContact && (
                  <Button variant="outlined" onClick={() => onShareContact(true)}>Save</Button>
                )}
              </div>
              </>)}
            </Paper>
            <Paper sx={sxStyles.card} elevation={2}>
              {!areas.library ? closedNote : (<>
              <FormControlLabel
                control={<Switch id="share-library" checked={!!church.shareLibrary} onChange={(e) => onShare(e.target.checked)} />}
                label="List my books and movies for this church"
                htmlFor="share-library"
              />
              <Typography sx={{ color: '#666', fontSize: '0.85rem' }}>
                Off by default. When on, members of this church can see the titles in your Community Library and whether each
                is in or out. They never see who borrowed something, your pictures or your contacts. Leaving the church switches this off.
              </Typography>
              </>)}
            </Paper>
            {areas.library && <Paper sx={sxStyles.card} elevation={2}>
              {catalog.length === 0 && <Typography sx={{ color: '#666' }}>Nobody has listed their library yet.</Typography>}
              {catalog.map((p) => (
                <div key={p.name} style={{ marginBottom: '16px' }}>
                  <Typography sx={{ fontWeight: 700, color: '#1a237e' }}>{p.name}{p.isYou ? ' (you)' : ''}</Typography>
                  {p.books.length === 0 && p.movies.length === 0 && <Typography sx={{ color: '#666' }}>Nothing listed.</Typography>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8 }}>
                    {p.books.map((b) => (
                      <ShareCard key={`b${b.ref}`} kind="book" item={{ ...b, sharedBy: p.name }} title={b.title}
                        sub={[b.author, b.year].filter(Boolean).join(' · ')} borrow={borrow} onAsk={setAsk}
                        isYou={p.isYou} canAsk={!!church.shareLibrary} />
                    ))}
                    {p.movies.map((m) => (
                      <ShareCard key={`m${m.ref}`} kind="movie" item={{ ...m, sharedBy: p.name }} title={m.name}
                        sub={m.films.length > 1 ? m.films.map((f) => f.name).join(', ') : m.media} borrow={borrow} onAsk={setAsk}
                        isYou={p.isYou} canAsk={!!church.shareLibrary} />
                    ))}
                  </div>
                </div>
              ))}
              {!church.shareLibrary && catalog.length > 0 && <Typography sx={{ color: '#666', fontSize: '0.8rem' }}>Turn on library sharing to ask to borrow.</Typography>}
              <BorrowRequests borrow={borrow} />
              <AskDialog ask={ask} onClose={() => setAsk(null)} onSend={(a, note) => borrow.request(a.kind, a.ref, note)} />
            </Paper>}
          </>
        )}

        {church && !working && startOrJoin}
      </div>

      {church && (
        <div style={sxStyles.foot}>
          {working && isOwner && tab === 0 && (
            <>
              <Button variant="outlined" onClick={() => open('mission')}>Edit mission</Button>
              <Button variant="outlined" onClick={() => open('resetCode')}>New join code</Button>
            </>
          )}
          {working && can('announcements.post') && areas.announcements && tab === 1 && (
            <Button variant="contained" sx={sxStyles.primary} onClick={() => openNews(null)}>New announcement</Button>
          )}
          {working && isOwner && tab === 2 && (
            <Button variant="outlined" onClick={() => open('transfer')}
              disabled={!members.some((m) => m.role !== 'owner' && m.status === 'active')}>
              Hand over church
            </Button>
          )}
          {!isOwner && (
            <Button color="error" onClick={() => setDialog('leave')}>
              {working ? 'Leave church' : 'Withdraw request'}
            </Button>
          )}
        </div>
      )}

      <FitDialog open={dialog === 'create'} onClose={close} maxWidth="xs">
        <DialogTitle>Request a new church</DialogTitle>
        <FitContent>
          <TextField fullWidth autoFocus margin="dense" label="Church name" value={fName}
            onChange={(e) => setFName(e.target.value)} inputProps={{ maxLength: 150 }} />
          <TextField fullWidth multiline minRows={3} maxRows={6} margin="dense" label="Mission statement (optional)" value={fMission}
            onChange={(e) => setFMission(e.target.value)} inputProps={{ maxLength: 2000 }} />
          <DialogContentText sx={{ fontSize: '0.85rem' }}>
            You become the owner. The church can be used once it is approved.
          </DialogContentText>
        </FitContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={onCreate} disabled={busy || !fName.trim()} variant="contained" sx={sxStyles.primary}>Request</Button>
        </DialogActions>
      </FitDialog>

      <FitDialog open={dialog === 'join'} onClose={close} maxWidth="xs">
        <DialogTitle>Join a church</DialogTitle>
        <FitContent>
          <TextField fullWidth autoFocus margin="dense" label="Join code" value={fCode}
            onChange={(e) => setFCode(e.target.value.toUpperCase())} inputProps={{ maxLength: 8 }} />
          <DialogContentText sx={{ fontSize: '0.85rem' }}>
            The church owner will see your name and decide whether to approve you.
          </DialogContentText>
        </FitContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={onJoin} disabled={busy || !fCode.trim()} variant="contained" sx={sxStyles.primary}>Send request</Button>
        </DialogActions>
      </FitDialog>

      <FitDialog open={dialog === 'mission'} onClose={close} maxWidth="sm">
        <DialogTitle>Edit mission statement</DialogTitle>
        <FitContent>
          <TextField fullWidth autoFocus multiline minRows={4} maxRows={10} margin="dense" label="Mission statement" value={fMission}
            onChange={(e) => setFMission(e.target.value)} inputProps={{ maxLength: 2000 }} />
        </FitContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={onMission} disabled={busy} variant="contained" sx={sxStyles.primary}>Save</Button>
        </DialogActions>
      </FitDialog>

      <FitDialog open={dialog === 'news'} onClose={close} maxWidth="sm">
        <DialogTitle>{editing ? 'Edit announcement' : 'New announcement'}</DialogTitle>
        <FitContent>
          <TextField fullWidth autoFocus margin="dense" label="Title" value={fTitle}
            onChange={(e) => setFTitle(e.target.value)} inputProps={{ maxLength: 150 }} />
          <TextField fullWidth multiline minRows={4} maxRows={10} margin="dense" label="Message (optional)" value={fBody}
            onChange={(e) => setFBody(e.target.value)} inputProps={{ maxLength: 4000 }} />
          <DialogContentText sx={{ fontSize: '0.85rem' }}>
            Every active member of this church can read this. Do not post health or other private details about anyone.
          </DialogContentText>
        </FitContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={onSaveNews} disabled={busy || !fTitle.trim()} variant="contained" sx={sxStyles.primary}>{editing ? 'Save' : 'Post'}</Button>
        </DialogActions>
      </FitDialog>

      <FitDialog open={dialog === 'leave'} onClose={close} maxWidth="xs">
        <DialogTitle>{working ? 'Leave this church?' : 'Withdraw your request?'}</DialogTitle>
        <FitContent>
          <DialogContentText>
            {working
              ? 'You will no longer see this church. To come back you would need to ask to join again.'
              : 'Your request to join will be cancelled.'}
          </DialogContentText>
        </FitContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>Stay</Button>
          <Button onClick={onLeave} disabled={busy} color="error" variant="contained">{working ? 'Leave' : 'Withdraw'}</Button>
        </DialogActions>
      </FitDialog>

      <FitDialog open={dialog === 'resetCode'} onClose={close} maxWidth="xs">
        <DialogTitle>Make a new join code?</DialogTitle>
        <FitContent>
          <DialogContentText>
            The old code stops working at once. People already in the church, and requests already waiting, are not affected.
          </DialogContentText>
        </FitContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={onResetCode} disabled={busy} variant="contained" sx={sxStyles.primary}>Make new code</Button>
        </DialogActions>
      </FitDialog>

      <FitDialog open={dialog === 'transfer'} onClose={close} maxWidth="xs">
        <DialogTitle>Hand the church to someone else</DialogTitle>
        <FitContent>
          <DialogContentText sx={{ marginBottom: '8px' }}>
            The person you pick becomes the owner. You become a regular member and can leave later. Only an active member can be chosen.
          </DialogContentText>
          <TextField select fullWidth margin="dense" label="New owner" value={fMember} onChange={(e) => setFMember(e.target.value)}>
            {members.filter((m) => m.role !== 'owner' && m.status === 'active').map((m) => (
              <MenuItem key={m.memberId} value={m.memberId}>{m.name}</MenuItem>
            ))}
          </TextField>
          <TextField fullWidth margin="dense" type="password" label="Your password" value={fPassword}
            onChange={(e) => setFPassword(e.target.value)} autoComplete="current-password" />
        </FitContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={onTransfer} disabled={busy || !fMember || !fPassword} variant="contained" color="error">Hand over</Button>
        </DialogActions>
      </FitDialog>

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg('')} message={msg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  );
}
