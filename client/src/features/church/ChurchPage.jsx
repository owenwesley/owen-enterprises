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

export default function ChurchPage() {
  const {
    churches, loaded, loadChurches, createChurch, joinChurch, getMembers,
    approveMember, removeMember, saveMission, leaveChurch,
    resetJoinCode, transferChurch, setShareLibrary, setShareContact, getCatalog,
  } = useChurch();

  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState(0);
  const [members, setMembers] = useState([]);
  const [catalog, setCatalog] = useState([]);
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

  const refreshMembers = useCallback(async () => {
    if (church && working) setMembers(await getMembers(church.churchId));
    else setMembers([]);
  }, [church, working, getMembers]);

  const refreshCatalog = useCallback(async () => {
    if (church && working) setCatalog(await getCatalog(church.churchId));
    else setCatalog([]);
  }, [church, working, getCatalog]);

  useEffect(() => { if (tab === 1) refreshMembers(); }, [tab, refreshMembers]);
  useEffect(() => { if (tab === 2) refreshCatalog(); }, [tab, refreshCatalog]);
  useEffect(() => { setTab(0); }, [selectedId]);
  // Fill the contact fields from what the server holds whenever the church (or its saved values) changes.
  useEffect(() => {
    setCPhone(church ? church.contactPhone || '' : '');
    setCAddress(church ? church.contactAddress || '' : '');
  }, [church && church.churchId, church && church.contactPhone, church && church.contactAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (name) => { setFName(''); setFMission(church && name === 'mission' ? church.missionStatement : ''); setFCode(''); setFMember(''); setFPassword(''); setDialog(name); };
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
    if (r && !r.error) { setMsg(r.message); if (tab === 2) refreshCatalog(); }
  };
  const onShareContact = async (share) => {
    const r = await setShareContact(church.churchId, share, cPhone.trim(), cAddress.trim());
    if (r && !r.error) setMsg(r.message);
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
          <Paper sx={sxStyles.card} elevation={2}>
            {members.length === 0 && <Typography sx={{ color: '#666' }}>No members to show.</Typography>}
            {members.map((m) => (
              <div key={m.memberId} style={sxStyles.row}>
                <Typography sx={{ flex: '1 1 auto', minWidth: 0, fontWeight: m.isYou ? 700 : 400 }} noWrap>
                  {m.name}{m.isYou ? ' (you)' : ''}
                </Typography>
                {m.role === 'owner' && <Chip size="small" label="Owner" color="primary" />}
                {m.status === 'pending' && <Chip size="small" label="Waiting" color="warning" />}
                {isOwner && m.status === 'pending' && (
                  <Button size="small" variant="contained" sx={sxStyles.primary} onClick={() => onApprove(m)}>Approve</Button>
                )}
                {isOwner && m.role === 'member' && (
                  <Button size="small" color="error" onClick={() => onRemove(m)}>{m.status === 'pending' ? 'Decline' : 'Remove'}</Button>
                )}
              </div>
            ))}
          </Paper>
        )}

        {church && working && tab === 2 && (
          <>
            <Paper sx={sxStyles.card} elevation={2}>
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
            </Paper>
            <Paper sx={sxStyles.card} elevation={2}>
              <FormControlLabel
                control={<Switch id="share-library" checked={!!church.shareLibrary} onChange={(e) => onShare(e.target.checked)} />}
                label="List my books and movies for this church"
                htmlFor="share-library"
              />
              <Typography sx={{ color: '#666', fontSize: '0.85rem' }}>
                Off by default. When on, members of this church can see the titles in your Community Library and whether each
                is in or out. They never see who borrowed something, your pictures or your contacts. Leaving the church switches this off.
              </Typography>
            </Paper>
            <Paper sx={sxStyles.card} elevation={2}>
              {catalog.length === 0 && <Typography sx={{ color: '#666' }}>Nobody has listed their library yet.</Typography>}
              {catalog.map((p) => (
                <div key={p.name} style={{ marginBottom: '16px' }}>
                  <Typography sx={{ fontWeight: 700, color: '#1a237e' }}>{p.name}{p.isYou ? ' (you)' : ''}</Typography>
                  {p.books.length === 0 && p.movies.length === 0 && <Typography sx={{ color: '#666' }}>Nothing listed.</Typography>}
                  {p.books.map((b, i) => (
                    <div key={`b${i}`} style={sxStyles.row}>
                      <Typography sx={{ flex: '1 1 auto', minWidth: 0 }}>{b.title}{b.author ? ` — ${b.author}` : ''}</Typography>
                      <Chip size="small" label={b.available ? 'In' : 'Out'} color={b.available ? 'success' : 'default'} />
                    </div>
                  ))}
                  {p.movies.map((m, i) => (
                    <div key={`m${i}`} style={sxStyles.row}>
                      <Typography sx={{ flex: '1 1 auto', minWidth: 0 }}>
                        {m.name}{m.films.length > 1 ? ` (${m.films.map((f) => f.name).join(', ')})` : ''}
                      </Typography>
                      <Chip size="small" label={m.available ? 'In' : 'Out'} color={m.available ? 'success' : 'default'} />
                    </div>
                  ))}
                </div>
              ))}
            </Paper>
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
          {working && isOwner && tab === 1 && (
            <Button variant="outlined" onClick={() => open('transfer')}
              disabled={!members.some((m) => m.role === 'member' && m.status === 'active')}>
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
            {members.filter((m) => m.role === 'member' && m.status === 'active').map((m) => (
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
