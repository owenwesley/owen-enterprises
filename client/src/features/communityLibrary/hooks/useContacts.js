import { useCallback, useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch } from '../../../utils/api';

export function useContacts() {
  const { state, dispatch } = useAppContext();
  const { contacts, user } = state;
  // Live, read-only: church members who chose to share. Never stored in the contacts table.
  const [churchContacts, setChurchContacts] = useState([]);

  const getChurchContacts = useCallback(async () => {
    if (!user.id) return;
    const data = await getFetch(`/church/contacts/${user.id}`);
    setChurchContacts(data?.results || []);
  }, [user.id]);

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

  // The dialog holds its own copy of the row, so save that row directly
  // (no shared-array edit state to go stale or be left half-edited).
  const saveContact = useCallback(async (contact) => {
    const res = await postFetch(`/communitylibrary/contacts/edit/${user.id}`, contact);
    await getContacts();
    return res?.error || null;
  }, [user.id, getContacts]);

  const deleteContact = useCallback(async (i) => {
    await postFetch(`/communitylibrary/contacts/delete/${user.id}`, { id: contacts[i].id });
    await getContacts();
  }, [contacts, user.id, getContacts]);

  return {
    contacts, churchContacts, getChurchContacts,
    getContacts, addContact, saveContact, deleteContact,
  };
}
