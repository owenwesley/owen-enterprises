// client/src/features/meetings/utils/sendReportToDrive.js
//
// Runs right BEFORE "Reset Period" wipes the table:
//   1. extract the rows  2. build a landscape PDF  3. POST it + the email to the server.
// Returns true only when the server confirmed it; the caller resets the table only then.

import { postFormData } from '../../../utils/api';
import { formatDate } from '../../../utils/dateFormat';
import { CHIP_COLS, MEDALLION_COLS } from '../hooks/useMeetings';

const REPORT_TITLE = 'Richfield NA Report';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One source of truth for the columns (same order as the on-screen table).
// Milestones = the chip columns + the medallion columns.
const COLUMNS = [
  { key: 'date',       label: 'Date', date: true },
  { key: 'chair',      label: 'Chair' },
  { key: 'coChair',    label: 'Co-Chair' },
  ...CHIP_COLS.map((c) => ({ ...c, group: 'Chips' })),
  ...MEDALLION_COLS.map((c) => ({ ...c, group: 'Medallions' })),
  { key: 'attendance', label: 'Attend.' },
  { key: 'memo',       label: 'Memo' },
  { key: 'deposit',    label: 'Deposit', money: true },
  { key: 'balance',    label: 'Balance', money: true },
];

const cellText = (col, row) => {
  const v = row[col.key];
  if (col.date) return formatDate(v);                 // stays MM-DD-YY
  if (v === 0 || v) return col.money ? `$${v}` : String(v);
  return '';
};

/** STEP 1 - turn the table rows into plain arrays (header rows + body + totals). */
export function extractReportData(rows, totals) {
  const body = rows.map((r) => COLUMNS.map((c) => cellText(c, r)));

  const totalsRow = COLUMNS.map((c) => {
    if (c.key === 'date') return 'TOTALS';
    if (c.key === 'balance') return rows.length ? `$${rows[rows.length - 1].balance}` : '$0.00';
    if (['chair', 'coChair', 'memo'].includes(c.key)) return '';
    return c.money ? `$${totals[c.key]}` : String(totals[c.key] ?? '');
  });

  return { body, totalsRow };
}

/** STEP 2 - build the landscape PDF and return it as a Blob. */
export async function buildReportPdf(rows, totals) {
  // Loaded on demand so the PDF libraries are not in the main bundle.
  const { jsPDF } = await import('jspdf');
  const at = await import('jspdf-autotable');
  const autoTable = [at.default, at.default && at.default.default, at.autoTable].find((f) => typeof f === 'function');

  const { body, totalsRow } = extractReportData(rows, totals);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

  doc.setFontSize(14);
  doc.text(REPORT_TITLE, 20, 26);
  doc.setFontSize(8);
  doc.text(
    `Avg Attendance: ${totals.avgAttendance}   |   Area Donation: $${totals.areaDonation}   |   ` +
    `Balance: $${rows.length ? rows[rows.length - 1].balance : '0.00'}`,
    20, 38,
  );

  // Two-row header like the screen: group names on top, column names below.
  const groupRow = [];
  COLUMNS.forEach((c) => {
    if (c.group) {
      const last = groupRow[groupRow.length - 1];
      if (last && last.content === c.group) last.colSpan += 1;
      else groupRow.push({ content: c.group, colSpan: 1, styles: { halign: 'center' } });
    } else if (c.key === 'chair') {
      groupRow.push({ content: 'Chairs', colSpan: 2, styles: { halign: 'center' } });
    } else if (c.key !== 'coChair') {
      groupRow.push({ content: '', colSpan: 1 });
    }
  });

  autoTable(doc, {
    startY: 46,
    head: [groupRow, COLUMNS.map((c) => c.label)],
    body: [...body, totalsRow],
    theme: 'grid',
    margin: { left: 20, right: 20, top: 20, bottom: 20 },
    styles: { fontSize: 6, cellPadding: 2, halign: 'center', overflow: 'ellipsize' },
    headStyles: { fillColor: [26, 35, 126], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 38 },                                  // Date
      1: { cellWidth: 64, halign: 'left' },                  // Chair
      2: { cellWidth: 64, halign: 'left' },                  // Co-Chair
      [COLUMNS.findIndex((c) => c.key === 'memo')]: { cellWidth: 46, halign: 'left' },
    },
    didParseCell: (d) => {                                    // bold, shaded TOTALS row
      if (d.section === 'body' && d.row.index === body.length) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [232, 234, 246];
      }
    },
    didDrawPage: () => {                                      // page x of y footer
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, 20, h - 8);
    },
  });

  return doc.output('blob');
}

/**
 * STEP 1-4 (client side): ask for the email, build the PDF, send it.
 * Returns true if the server accepted it (safe to reset), false otherwise.
 * `user` = the signed-in user (state.user), `rows` = computeBalance(meetings),
 * `totals` = computeTotals(meetings) - all already available on MeetingsPage.
 */
export async function sendReportToDrive({ userId, rows, totals }) {
  // 1. PROMPT FOR EMAIL
  const email = (window.prompt('Enter the Google Drive email address to send the report to:') || '').trim();
  if (!email) return false;                                   // cancelled / empty: do NOT reset
  if (!EMAIL_RE.test(email)) { window.alert('That does not look like a valid email address.'); return false; }

  // 2 + 3. EXTRACT + GENERATE PDF
  let pdf;
  try { pdf = await buildReportPdf(rows, totals); }
  catch (err) { console.error('PDF build failed:', err); window.alert('Could not build the PDF. The table was NOT reset.'); return false; }

  // 4a. SEND  (multipart, not JSON: express.json() is capped at 100 KB)
  const stamp = new Date().toISOString().slice(0, 10);
  const form = new FormData();
  form.append('email', email);
  form.append('report', pdf, `Richfield-NA-Report-${stamp}.pdf`);
  const res = await postFormData(`/meetings/send-to-drive/${userId}`, form);

  // postFormData already toasts the server's error text; null = network failure.
  if (!res || res.error || !res.ok) return false;
  return true;
}
