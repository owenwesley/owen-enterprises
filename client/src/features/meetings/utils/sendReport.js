// 1.13.5: the Meetings report (replaces the 1.13.4 Google Drive upload).
//   sendReport()      builds the landscape PDF (with the user's meeting logo at the top) and saves it on the
//                     server (POST /meetings/reports/:user_id). Returns the saved file name, or null.
//   downloadReport()  fetches a saved report and hands it to the browser (save, or open to print). It stays on
//                     the server (and the badge stays) until the user confirms with deleteReport().
//   deleteReport()    "I saved it": removes the report from the server.
// jsPDF and jspdf-autotable are loaded only when a report is built.
import { getBlobUrl, postFormData, deleteFetch, notifyError } from '../../../utils/api';
import { formatDate } from '../../../utils/dateFormat';
import { CHIP_COLS, MEDALLION_COLS } from '../hooks/useMeetings';
import { DEFAULT_LOGO } from '../hooks/useMeetingLogo';
import { REPORTS_CHANGED } from '../hooks/useMeetingReports';

export const REPORT_TITLE = 'Richfield NA Report';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CARRY_MEMOS = ['Prv Bal', 'Area Donation'];   // rows a reset writes itself; not real meetings

/** "2026-10" for the newest real meeting in the table, or '' (the server then uses the month before today). */
export function reportPeriod(rows) {
  let best = null;
  (rows || []).forEach((r) => {
    if (CARRY_MEMOS.includes(r.memo)) return;
    const m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(formatDate(r.date));   // MM-DD-YY
    if (!m) return;
    const key = Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]);
    if (!best || key > best.key) best = { key, yy: m[3], mm: m[1] };
  });
  return best ? `20${best.yy}-${best.mm}` : '';
}
const periodText = (period) => {
  const m = /^(\d{4})-(\d{2})$/.exec(period || '');
  return m ? `${MONTHS[Number(m[2]) - 1]}-${m[1].slice(2)}` : '';
};

const num = (v) => (v === undefined || v === null || v === '' ? '0' : String(v));
const money = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v).toFixed(2) : '0.00');

// Any picture URL -> PNG data URL (jsPDF cannot read WebP). null when it cannot be loaded.
function toPng(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        // 160 px is plenty for a 15 mm logo and keeps the PDF small (an uncompressed 256 px PNG alone was ~330 KB).
        const k = Math.min(1, 160 / Math.max(img.naturalWidth || 160, img.naturalHeight || 160));
        c.width = Math.max(1, Math.round((img.naturalWidth || 160) * k)); c.height = Math.max(1, Math.round((img.naturalHeight || 160) * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve({ dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// The user's own logo, else the default, else none (the PDF is still built).
async function loadLogo(userId) {
  const own = await getBlobUrl(`/meetings/logo/${userId}`);
  if (own) {
    const png = await toPng(own);
    URL.revokeObjectURL(own);
    if (png) return png;
  }
  return toPng(DEFAULT_LOGO);
}

export async function buildReportPdf({ rows, totals, logo, period }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 8;

  // ---- top of the first page: logo, title, period, summary ------------------------------------
  let textX = margin;
  if (logo) {
    const box = 15;
    const scale = Math.min(box / logo.w, box / logo.h);
    const w = logo.w * scale, h = logo.h * scale;
    doc.addImage(logo.dataUrl, 'PNG', margin, 6 + (box - h) / 2, w, h, undefined, 'FAST');
    textX = margin + box + 4;
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(26, 35, 126);
  doc.text(REPORT_TITLE, textX, 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80);
  const last = rows.length ? rows[rows.length - 1].balance : '0.00';
  doc.text(`Avg Attendance: ${totals.avgAttendance}   |   Area Donation: $${totals.areaDonation}   |   Balance: $${money(last)}`, textX, 17.5);
  const label = periodText(period);
  if (label) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 35, 126); doc.text(label, pageW - margin, 12, { align: 'right' }); }

  // ---- table ----------------------------------------------------------------------------------
  const cols = [
    { key: 'date', label: 'Date' }, { key: 'chair', label: 'Chair' }, { key: 'coChair', label: 'Co-Chair' },
    ...CHIP_COLS, ...MEDALLION_COLS,
    { key: 'attendance', label: 'Attend.' }, { key: 'memo', label: 'Memo' },
    { key: 'deposit', label: 'Deposit' }, { key: 'balance', label: 'Balance' },
  ];
  const cell = (r, k) => {
    if (k === 'date') return formatDate(r.date);
    if (k === 'chair' || k === 'coChair' || k === 'memo') return r[k] === undefined || r[k] === null ? '' : String(r[k]);
    if (k === 'deposit' || k === 'balance') return money(r[k]);
    return num(r[k]);
  };
  const body = rows.map((r) => cols.map((c) => cell(r, c.key)));
  body.push(cols.map((c) => {
    if (c.key === 'date') return 'TOTALS';
    if (c.key === 'chair' || c.key === 'coChair' || c.key === 'memo') return '';
    if (c.key === 'balance') return money(last);
    if (c.key === 'deposit') return money(totals.deposit);
    return num(totals[c.key]);
  }));
  const leftCols = {};
  cols.forEach((c, i) => { if (c.key === 'chair' || c.key === 'coChair' || c.key === 'memo') leftCols[i] = { halign: 'left' }; });

  autoTable(doc, {
    head: [cols.map((c) => c.label)],
    body,
    startY: 24,
    margin: { left: margin, right: margin, top: 10, bottom: 10 },
    styles: { fontSize: 5.6, cellPadding: 0.7, halign: 'center', valign: 'middle', overflow: 'ellipsize', lineColor: [200, 200, 200], lineWidth: 0.1 },
    headStyles: { fillColor: [26, 35, 126], textColor: 255, fontStyle: 'bold', overflow: 'linebreak' },
    columnStyles: leftCols,
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === body.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [232, 234, 246]; }
    },
  });

  const pages = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120);
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.text(`Page ${p} of ${pages}`, pageW - margin, doc.internal.pageSize.getHeight() - 4, { align: 'right' });
  }
  return doc.output('blob');
}

/** Build the PDF and save it on the server. Returns the saved file name, or null (nothing was saved). */
export async function sendReport({ userId, rows, totals }) {
  let blob; let period;
  try {
    period = reportPeriod(rows);
    const logo = await loadLogo(userId);
    blob = await buildReportPdf({ rows, totals, logo, period });
  } catch (err) {
    console.error('report PDF failed:', err);
    notifyError('Could not build the report PDF. The table was not reset.');
    return null;
  }
  const form = new FormData();
  if (period) form.append('period', period);
  form.append('report', blob, 'report.pdf');
  const res = await postFormData(`/meetings/reports/${userId}`, form);   // a failure already showed its toast
  if (res && res.ok && res.name) {
    window.dispatchEvent(new Event(REPORTS_CHANGED));
    return res.name;
  }
  return null;
}

/**
 * Hand a saved report to the browser. print=true opens it in a new tab (print from the viewer);
 * otherwise it is saved as a file. The report is NOT deleted: the user does that with "I saved it".
 */
export async function downloadReport({ userId, name, print = false }) {
  const w = print ? window.open('', '_blank') : null;   // opened right away so a pop-up blocker allows it
  const url = await getBlobUrl(`/meetings/reports/${encodeURIComponent(name)}/${userId}`);
  if (!url) {
    if (w) w.close();
    notifyError('Could not download that report. It is still saved on the server; try again.');
    return false;
  }
  if (w) { w.location.href = url; return true; }
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

/** "I saved it": delete the report from the server. Returns true when it is gone. */
export async function deleteReport({ userId, name }) {
  const res = await deleteFetch(`/meetings/reports/${encodeURIComponent(name)}/${userId}`);
  window.dispatchEvent(new Event(REPORTS_CHANGED));
  return !!(res && res.ok);
}
