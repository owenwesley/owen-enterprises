import { useCallback } from 'react';
import { todayFormatted } from '../../../utils/dateFormat';
import { useAppContext } from '../../../context/AppContext';
import { getFetch, postFetch } from '../../../utils/api';

export const CHIP_COLS = [
  { key: 'newComer', label: 'New Comer' },
  { key: 'day30',    label: '30 Day'    },
  { key: 'day60',    label: '60 Day'    },
  { key: 'day90',    label: '90 Day'    },
  { key: 'month6',   label: '6 Month'   },
  { key: 'month9',   label: '9 Month'   },
  { key: 'month12',  label: '1 Year'    },
  { key: 'month18',  label: '18 Month'  },
  { key: 'multiyr',  label: 'Multi Yr'  },
];

export const MEDALLION_COLS = Array.from({ length: 10 }, (_, i) => ({
  key: `gc${i + 1}`, label: `${i + 1} Yr`,
}));

export const emptyMeeting = (user_id) => ({
  user_id,
  date: todayFormatted(),
  chair: 'N/A', coChair: 'N/A',
  newComer: 0, day30: 0, day60: 0, day90: 0,
  month6: 0, month9: 0, month12: 0, month18: 0, multiyr: 0,
  gc1: 0, gc2: 0, gc3: 0, gc4: 0, gc5: 0,
  gc6: 0, gc7: 0, gc8: 0, gc9: 0, gc10: 0,
  attendance: 0, memo: 'N/A', deposit: 0,
});

export function computeBalance(meetings) {
  let running = 0;
  return meetings.map((m) => {
    running += parseFloat(m.deposit || 0);
    return { ...m, balance: running.toFixed(2) };
  });
}

export function computeTotals(meetings) {
  const NUM_COLS = [
    'newComer','day30','day60','day90','month6','month9','month12','month18','multiyr',
    'gc1','gc2','gc3','gc4','gc5','gc6','gc7','gc8','gc9','gc10','attendance','deposit',
  ];
  const totals = { date: 'TOTALS', chair: '', coChair: '', memo: '' };
  NUM_COLS.forEach((k) => {
    totals[k] = meetings.reduce((s, m) => s + parseFloat(m[k] || 0), 0);
  });

  // Avg Attendance = total attendance / number of meetings with attendance.
  // Port of the original Java calculateAverage():
  //   if (!"0".equals(att) && !"N/A".equals(memo) || !"0".equals(att) && !"Donations".equals(memo)) index++;
  //   average = index == 0 ? totalAttendance / 1 : totalAttendance / index;
  // A memo can't be both 'N/A' and 'Donations', so that condition is true for
  // every row whose attendance is not 0 - the memo never excludes anything.
  // (1.10.14 wrongly excluded N/A / Donations rows; 1.10.15 restores the Java
  // behaviour.) Attendance is compared numerically so '0', '0.0' and '' all
  // count as zero. Rows with attendance 0 add nothing to the total either, so
  // the numerator and divisor now cover the same rows.
  let index = 0;
  meetings.forEach((m) => {
    if (parseFloat(m.attendance || 0) !== 0) index += 1;
  });
  const averageAttendance = index === 0
    ? totals.attendance / 1
    : totals.attendance / index;
  totals.avgAttendance = meetings.length ? averageAttendance.toFixed(1) : '0.0';

  // Area Donation = 10% of the deposit for every meeting with attendance.
  // Port of the original Java rule:
  //   !"0".equals(att) && !"N/A".equals(memo) || !"0".equals(att) && !"Donations".equals(memo)
  // A memo can't be both 'N/A' and 'Donations', so that condition is true for
  // every row whose attendance is not 0 - the memo never excluded anything.
  // 1.10.13 restores exactly that behaviour. (An earlier change made it AND
  // across all three tests; because new rows default to memo 'N/A', that left
  // Area Donation stuck at 0.00 until a real memo was picked on every row.)
  // Attendance is compared numerically so '0', '0.0' and '' all count as zero.
  // Uses the same attendance-is-not-0 test as avgAttendance above.
  let totalAreaDonation = 0.00;
  meetings.forEach((m) => {
    if (parseFloat(m.attendance || 0) !== 0) {
      totalAreaDonation += parseFloat(m.deposit || 0) * 0.1;
    }
  });
  totals.areaDonation = totalAreaDonation.toFixed(2);
  totals.deposit      = totals.deposit.toFixed(2);
  return totals;
}

export function useMeetings() {
  const { state, dispatch } = useAppContext();
  const { meetings, user, editIdx, editDraft } = state;

  const getMeetings = useCallback(async () => {
    if (!user.id) return;
    const data = await getFetch(`/meetings/${user.id}`);
    dispatch({ type: 'SET_MEETINGS', payload: data?.results || [] });
  }, [user.id, dispatch]);

  const addMeeting = useCallback(async () => {
    if (!user.id) return;
    await postFetch(`/meetings/add/${user.id}`, emptyMeeting(user.id));
    await getMeetings();
  }, [user.id, getMeetings]);

  // rowId is the row's database id; every keystroke writes ONLY to the
  // isolated editDraft (BEGIN_EDIT / UPDATE_EDIT_DRAFT / CANCEL_EDIT — same
  // pattern as BP/weights/medications/nutrition/memos/chairs) so a background
  // refetch or re-sort mid-edit can't retarget the edit at the wrong row.
  // This is the row most likely to actually hit that bug in practice: ~25
  // editable fields plus 2 live dropdowns pulling from the chairs/memos hooks.
  const handleMeetingChange = useCallback((e, key /*, rowId */) => {
    dispatch({ type: 'UPDATE_EDIT_DRAFT', payload: { name: key, value: e.target.value } });
  }, [dispatch]);

  const startEditing = useCallback((rowId) => {
    const row = meetings.find((m) => m.id === rowId);
    if (!row) return;
    dispatch({ type: 'BEGIN_EDIT', payload: { rowId, row } });
  }, [meetings, dispatch]);

  const cancelEditing = useCallback(() => {
    dispatch({ type: 'CANCEL_EDIT' });
  }, [dispatch]);

  const stopEditing = useCallback(async () => {
    const original = meetings.find((m) => m.id === editIdx);
    dispatch({ type: 'CANCEL_EDIT' }); // clears editIdx AND the draft
    if (!original) { await getMeetings(); return; }

    const row = { ...original, ...(editDraft || {}) };
    dispatch({ type: 'SET_MEETINGS', payload: meetings.map((m) => (m.id === original.id ? row : m)) });
    await postFetch(`/meetings/edit/${user.id}`, row);
    await getMeetings();
  }, [meetings, editIdx, editDraft, user.id, dispatch, getMeetings]);

  const deleteMeeting = useCallback(async (rowId) => {
    await postFetch(`/meetings/delete/${user.id}`, { id: rowId });
    await getMeetings();
  }, [user.id, getMeetings]);

  /**
   * Closes out the current period:
   *   1. Deletes every existing row.
   *   2. Inserts a "Prv Bal" row carrying forward all chip/medallion totals
   *      plus the running deposit balance, so the new period starts from
   *      the old one's cumulative counts rather than zero.
   *   3. Inserts an "Area Donation" row that deducts the 10% area
   *      contribution computed from this period's activity.
   *   4. Inserts one blank starter row for the new period.
   *
   * Fix: the uploaded revision referenced `totals.balance`, which
   * computeTotals() never sets (balance only exists per-row, from
   * computeBalance()). Compute it explicitly here instead.
   */
  const resetMeetings = useCallback(async () => {
    const totals = computeTotals(meetings);

    // Running balance = sum of every row's deposit (same math as computeBalance,
    // but we only need the final total here, not the per-row series).
    const finalBalance = meetings
      .reduce((sum, m) => sum + parseFloat(m.deposit || 0), 0)
      .toFixed(2);

    // Safer order than before: the new rows are written FIRST and the old rows
    // are deleted only if every one of them was saved. Previously the old rows
    // were deleted first, so a failed add part-way through lost the period.
    // Carry-forward row: all chip/medallion counts + running balance
    const newRows = [];
    newRows.push({
      ...emptyMeeting(user.id),
      newComer:   totals.newComer,
      day30:      totals.day30,
      day60:      totals.day60,
      day90:      totals.day90,
      month6:     totals.month6,
      month9:     totals.month9,
      month12:    totals.month12,
      month18:    totals.month18,
      multiyr:    totals.multiyr,
      gc1:  totals.gc1,  gc2: totals.gc2,   gc3: totals.gc3,
      gc4:  totals.gc4,  gc5: totals.gc5,   gc6: totals.gc6,
      gc7:  totals.gc7,  gc8: totals.gc8,   gc9: totals.gc9,
      gc10: totals.gc10,
      memo:    'Prv Bal',
      deposit: finalBalance,
    });

    // Area donation deduction row
    newRows.push({
      ...emptyMeeting(user.id),
      memo:    'Area Donation',
      deposit: -totals.areaDonation,
    });

    // Blank starter row for the new period
    newRows.push({ ...emptyMeeting(user.id) });

    for (const r of newRows) {
      const res = await postFetch(`/meetings/add/${user.id}`, r);
      if (!res || res.error) { await getMeetings(); return; }   // nothing deleted; toast already shown
    }
    for (const m of meetings) {
      await postFetch(`/meetings/delete/${user.id}`, { id: m.id });
    }

    await getMeetings();
  }, [meetings, user.id, getMeetings]);

  return {
    meetings, editIdx, editDraft,
    getMeetings, addMeeting,
    handleMeetingChange, startEditing, stopEditing, cancelEditing,
    deleteMeeting, resetMeetings,
  };
}
