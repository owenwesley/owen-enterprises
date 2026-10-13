#!/usr/bin/env node
/**
 * tests/meeting-report.js   (npm run check:report)   - 1.13.5
 *
 * No database needed. Checks routes/meetings/reports.js + utils/meetingReports.js on a throwaway Express app
 * with the REAL ownerOnly() in front (sign-in is faked: the signed-in user is the "x-test-user" header)
 * and a throwaway PDF_DIR. Covers: saving a report, the month-year file name, -2 for a taken name, the badge
 * list, download keeps the file, the confirmed delete removes it, other users locked out, bad names, and the logo.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const sharp = require('sharp');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfdir-'));
process.env.PDF_DIR = tmp;
const ownerOnly = require('../middleware/ownerOnly');
const files = require('../utils/meetingReports');

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) pass++; else { fail++; console.log('FAIL', name, extra || ''); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3000, 65)]);
const app = express();
app.use('/meetings', (req, res, next) => { req.user = { id: Number(req.headers['x-test-user']) }; next(); }, ownerOnly(), require('../routes/meetings/reports'));

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}/meetings`;
  const as = (id, init = {}) => ({ ...init, headers: { ...(init.headers || {}), 'x-test-user': String(id) } });
  const upload = async (id, bytes, period, field = 'report', route = 'reports') => {
    const f = new FormData();
    if (period != null) f.append('period', period);
    if (bytes) f.append(field, new Blob([bytes]), 'x.bin');
    const r = await fetch(`${base}/${route}/${id}`, as(id, { method: 'POST', body: f }));
    return { status: r.status, body: await r.json() };
  };
  const list = async (id) => (await (await fetch(`${base}/reports/${id}`, as(id))).json()).reports;
  try {
    // ---- file names -----------------------------------------------------------------------------
    check('period 2026-10 -> Oct-26', files.periodLabel('2026-10') === 'Oct-26');
    check('no period on 2026-11-01 -> Oct-26', files.periodLabel('', new Date(2026, 10, 1)) === 'Oct-26');
    check('no period in January -> Dec of last year', files.periodLabel(undefined, new Date(2027, 0, 5)) === 'Dec-26');
    check('bad period falls back to the month before today', /^[A-Z][a-z]{2}-\d{2}$/.test(files.periodLabel('2026-13')));

    // ---- save -----------------------------------------------------------------------------------
    check('nothing waiting at first', (await list(1)).length === 0);
    let r = await upload(1, pdf, '2026-10');
    check('save: 200 + name Richfield NA Report-Oct-26.pdf', r.status === 200 && r.body.name === 'Richfield NA Report-Oct-26.pdf', JSON.stringify(r));
    check('saved at <PDF_DIR>/1/reports/<name> with the same bytes',
      fs.readFileSync(path.join(tmp, '1', 'reports', 'Richfield NA Report-Oct-26.pdf')).equals(pdf));
    r = await upload(1, pdf, '2026-10');
    check('same month again -> -2, the first one is NOT overwritten', r.body.name === 'Richfield NA Report-Oct-26-2.pdf', JSON.stringify(r));
    r = await upload(1, pdf, '2026-11');
    check('another month keeps its own name', r.body.name === 'Richfield NA Report-Nov-26.pdf', JSON.stringify(r));
    check('badge list has 3', (await list(1)).length === 3);

    r = await upload(1, Buffer.from('hello, not a pdf'), '2026-10');
    check('not a PDF -> 400', r.status === 400 && (await list(1)).length === 3, JSON.stringify(r));
    r = await upload(1, null, '2026-10');
    check('no file -> 400', r.status === 400, JSON.stringify(r));
    r = await upload(1, Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(11 * 1024 * 1024)]), '2026-10');
    check('over 10 MB -> 413', r.status === 413, JSON.stringify(r));

    // ---- other users ------------------------------------------------------------------------------
    let res = await fetch(`${base}/reports/1`, as(2));
    check("another user cannot list my reports (ownerOnly 403)", res.status === 403);
    res = await fetch(`${base}/reports/${encodeURIComponent('Richfield NA Report-Oct-26.pdf')}/1`, as(2));
    check("another user cannot download my report", res.status === 403);
    check('user 2 has an empty list of their own', (await list(2)).length === 0);
    r = await upload(2, pdf, '2026-10');
    check('user 2 gets their own folder', r.status === 200 && fs.existsSync(path.join(tmp, '2', 'reports', r.body.name)));

    // ---- download keeps the file; "I saved it" deletes ------------------------------------------------
    const nm = 'Richfield NA Report-Nov-26.pdf';
    res = await fetch(`${base}/reports/${encodeURIComponent(nm)}/1`, as(1));
    const got = Buffer.from(await res.arrayBuffer());
    check('download: 200, PDF type, attachment, same bytes',
      res.status === 200 && res.headers.get('content-type') === 'application/pdf'
      && /attachment; filename="Richfield NA Report-Nov-26\.pdf"/.test(res.headers.get('content-disposition')) && got.equals(pdf));
    check('download is never cached', /no-store/.test(res.headers.get('cache-control') || ''));
    await sleep(200);
    check('a complete download does NOT delete the report (it waits for "I saved it")', fs.existsSync(path.join(tmp, '1', 'reports', nm)));
    check('badge list still has 3', (await list(1)).length === 3);
    res = await fetch(`${base}/reports/${encodeURIComponent(nm)}/1`, as(1));
    check('downloading it a second time works', res.status === 200 && Buffer.from(await res.arrayBuffer()).equals(pdf));

    res = await fetch(`${base}/reports/${encodeURIComponent(nm)}/1`, as(2, { method: 'DELETE' }));
    check("another user cannot delete my report (403)", res.status === 403 && fs.existsSync(path.join(tmp, '1', 'reports', nm)));
    res = await fetch(`${base}/reports/${encodeURIComponent(nm)}/1`, as(1, { method: 'DELETE' }));
    check('"I saved it": DELETE -> 200 and the file is gone', res.status === 200 && !fs.existsSync(path.join(tmp, '1', 'reports', nm)));
    check('badge list is down to 2', (await list(1)).length === 2);
    res = await fetch(`${base}/reports/${encodeURIComponent(nm)}/1`, as(1, { method: 'DELETE' }));
    check('deleting it again -> 404', res.status === 404);
    res = await fetch(`${base}/reports/${encodeURIComponent(nm)}/1`, as(1));
    check('downloading a deleted report -> 404', res.status === 404);
    res = await fetch(`${base}/reports/${encodeURIComponent('../../etc/passwd')}/1`, as(1, { method: 'DELETE' }));
    check('DELETE with a bad name -> 404/403, nothing removed', (res.status === 404 || res.status === 403) && (await list(1)).length === 2);

    // ---- bad names --------------------------------------------------------------------------------
    for (const bad of ['../../etc/passwd', 'logo.webp', 'Richfield NA Report-Oct-26.pdf.exe', 'Richfield NA Report-Xxx-26.pdf', '..%2F1%2Flogo.webp']) {
      res = await fetch(`${base}/reports/${bad.includes('%') ? bad : encodeURIComponent(bad)}/1`, as(1));
      check(`bad name "${bad}" -> 404`, res.status === 404 || res.status === 403, String(res.status));
    }

    // ---- logo -------------------------------------------------------------------------------------
    res = await fetch(`${base}/logo/1`, as(1));
    check('no logo yet -> 404', res.status === 404);
    const png = await sharp({ create: { width: 900, height: 500, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
    r = await upload(1, png, null, 'logo', 'logo');
    check('logo upload 200', r.status === 200, JSON.stringify(r));
    res = await fetch(`${base}/logo/1`, as(1));
    const logo = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(logo).metadata();
    check('logo served as WebP, shrunk to max 256 px', res.status === 200 && meta.format === 'webp' && Math.max(meta.width, meta.height) === 256, JSON.stringify(meta));
    check('logo is stored in pdf/<id>/logo.webp, beside (not inside) reports', fs.existsSync(path.join(tmp, '1', 'logo.webp')));
    check('the logo is not counted as a waiting report', (await list(1)).every((x) => x.name.endsWith('.pdf')));
    res = await fetch(`${base}/logo/1`, as(2));
    check("another user cannot read my logo", res.status === 403);
    r = await upload(1, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), null, 'logo', 'logo');
    check('SVG / non-picture logo refused (400), old logo kept', r.status === 400 && fs.existsSync(path.join(tmp, '1', 'logo.webp')), JSON.stringify(r));
    r = await upload(1, Buffer.alloc(4 * 1024 * 1024, 1), null, 'logo', 'logo');
    check('logo over 3 MB -> 413', r.status === 413, JSON.stringify(r));
    res = await fetch(`${base}/logo/1`, as(1, { method: 'DELETE' }));
    check('remove logo: 200 and the file is gone', res.status === 200 && !fs.existsSync(path.join(tmp, '1', 'logo.webp')));
    res = await fetch(`${base}/logo/1`, as(1, { method: 'DELETE' }));
    check('removing again is harmless', res.status === 200);

    // ---- limit + account deletion -------------------------------------------------------------------
    for (let i = 0; i < files.MAX_WAITING; i += 1) await files.saveReport(3, pdf, '2026-01').catch(() => {});
    r = await upload(3, pdf, '2026-02');
    check(`more than ${files.MAX_WAITING} waiting reports -> 409`, r.status === 409, JSON.stringify(r));
    await files.removeAllForUser(3);
    check('removeAllForUser deletes the whole folder', !fs.existsSync(path.join(tmp, '3')));
  } catch (e) { fail++; console.log('FAIL test crashed', e); }
  finally { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(`meeting-report: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
});
