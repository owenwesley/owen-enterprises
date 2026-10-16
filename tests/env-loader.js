#!/usr/bin/env node
/** tests/env-loader.js (npm run check:env) - 1.13.9. Env file outside the app folder is read; panel values win; audit_log is not rebuilt. */
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envtest-'));
const file = path.join(dir, '.env');
fs.writeFileSync(file, 'FROM_FILE_ONLY="abc"\nBOTH_PLACES=file\n# comment\nWITH_HASH="a#b"\n');
const snippet = fs.readFileSync(path.join(root, 'server.js'), 'utf8').split('const express')[0];
const run = (env) => spawnSync(process.execPath, ['-e', `${snippet.replace(/__dirname/g, JSON.stringify(root))}
console.log(JSON.stringify([process.env.FROM_FILE_ONLY, process.env.BOTH_PLACES, process.env.WITH_HASH]))`],
  { cwd: root, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
const a = JSON.parse(run({ ENV_FILE: file, BOTH_PLACES: 'panel' }).stdout.trim());
ok(a[0] === 'abc', 'value from the private file is read and quotes are stripped');
ok(a[1] === 'panel', 'a value set in the panel wins over the file');
ok(a[2] === 'a#b', 'a # inside a QUOTED value is kept');
const b = run({ ENV_FILE: path.join(dir, 'missing.env') });
ok(b.status === 0, 'a missing env file is skipped without error');
const src = fs.readFileSync(path.join(root, 'db/maintenance/scheduleRebuild.js'), 'utf8');
ok(/TABLE_NAME <> 'audit_log'/.test(src), 'weekly rebuild excludes audit_log');
fs.rmSync(dir, { recursive: true, force: true });
console.log(`env-loader: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
