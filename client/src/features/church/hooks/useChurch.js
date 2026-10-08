import { useState, useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch } from '../../../utils/api';

// Church module, step 1. State is local to the Church page (nothing else in the
// app needs it). postFetch resolves with the error body on failure, so every
// action returns the response and the caller checks `res.error`. The shared
// api utility already shows a toast for failed requests.
export function useChurch() {
  const { state } = useAppContext();
  const userId = state.user.id;
  const [churches, setChurches] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const loadChurches = useCallback(async () => {
    if (!userId) return;
    const data = await getFetch(`/church/mine/${userId}`);
    setChurches(data?.results || []);
    setLoaded(true);
  }, [userId]);

  const createChurch = useCallback(async (name, missionStatement) => {
    const res = await postFetch(`/church/create/${userId}`, { name, missionStatement });
    await loadChurches();
    return res;
  }, [userId, loadChurches]);

  const joinChurch = useCallback(async (joinCode) => {
    const res = await postFetch(`/church/join/${userId}`, { joinCode });
    await loadChurches();
    return res;
  }, [userId, loadChurches]);

  const getMembers = useCallback(async (churchId) => {
    const data = await getFetch(`/church/${churchId}/members/${userId}`);
    return data?.results || [];
  }, [userId]);

  const approveMember = useCallback((churchId, memberId) =>
    postFetch(`/church/${churchId}/members/approve/${userId}`, { memberId }), [userId]);

  const removeMember = useCallback((churchId, memberId) =>
    postFetch(`/church/${churchId}/members/remove/${userId}`, { memberId }), [userId]);

  const saveMission = useCallback(async (churchId, missionStatement) => {
    const res = await postFetch(`/church/${churchId}/edit/${userId}`, { missionStatement });
    await loadChurches();
    return res;
  }, [userId, loadChurches]);

  const leaveChurch = useCallback(async (churchId) => {
    const res = await postFetch(`/church/${churchId}/leave/${userId}`, {});
    await loadChurches();
    return res;
  }, [userId, loadChurches]);

  return { churches, loaded, loadChurches, createChurch, joinChurch, getMembers, approveMember, removeMember, saveMission, leaveChurch };
}
