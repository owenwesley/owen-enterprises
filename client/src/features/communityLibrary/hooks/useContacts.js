import { useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch } from '../../../utils/api';

export function useContacts() {
  const { state, dispatch } = useAppContext();
  const { contacts, user, editIdx } = state;

  const getContacts = useCallback(async () => {
    if (!user.id) return;
    const data = await getFetch(`/communitylibrary/contacts/${user.id}`);
    dispatch({ type: 'SET_CONTACTS', payload: data?.results || [] });
  }, [user.id, dispatch]);

  const addContact = useCallback(async (contact) => {
    if (!user.id) return;
    await postFetch(`/communitylibrary/contacts/add/${user.id}`, {
      firstName: '', lastName: '', phoneNum: '', email: '', address: '',
      ...contact,
    });
    await getContacts();
  }, [user.id, getContacts]);

  const handleContactChange = useCallback((field, value, i) => {
    dispatch({
      type: 'SET_CONTACTS',
      payload: contacts.map((c, j) => j === i ? { ...c, [field]: value } : c),
    });
  }, [contacts, dispatch]);

  const startEditingContact = useCallback((i) => {
    dispatch({ type: 'SET_EDIT_IDX', payload: i });
  }, [dispatch]);

  const stopEditingContact = useCallback(async () => {
    const contact = contacts[editIdx];
    dispatch({ type: 'SET_EDIT_IDX', payload: -1 });
    await postFetch(`/communitylibrary/contacts/edit/${user.id}`, contact);
    await getContacts();
  }, [contacts, editIdx, user.id, dispatch, getContacts]);

  const deleteContact = useCallback(async (i) => {
    await postFetch(`/communitylibrary/contacts/delete/${user.id}`, { id: contacts[i].id });
    await getContacts();
  }, [contacts, user.id, getContacts]);

  return {
    contacts, editIdx,
    getContacts, addContact,
    handleContactChange, startEditingContact, stopEditingContact, deleteContact,
  };
}
