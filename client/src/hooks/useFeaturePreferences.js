import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { getFetch, postFetch } from '../utils/api';

export function useFeaturePreferences() {
  const { state, dispatch } = useAppContext();
  const { user } = state;

  const loadFeaturePreferences = useCallback(async (user_id) => {
    if (!user_id) return;
    const data = await getFetch(`/owenenterprises/features/${user_id}`);
    if (data?.results) {
      dispatch({ type: 'SET_FEATURE_PREFS', payload: data.results });
    }
  }, [dispatch]);

  const saveFeaturePreferences = useCallback(async (prefs) => {
    if (!user.id) return;
    await postFetch(`/owenenterprises/features/edit/${user.id}`, prefs);
    dispatch({ type: 'SET_FEATURE_PREFS', payload: { ...state.featurePreferences, ...prefs } });
  }, [user.id, state.featurePreferences, dispatch]);

  return { loadFeaturePreferences, saveFeaturePreferences };
}
