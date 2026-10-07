/**
 * db/maintenance/deleteUser.js
 *
 * Deletes a user AND every row that belongs to them, across all five
 * databases. The app has no delete-account feature, and deleting a `users` row
 * by hand leaves their rows behind in bgtracker / meetings / communitylibrary
 * (no foreign keys there), which later makes rebuildTable.js refuse to
 * renumber `users`. Use this instead of a bare DELETE.
 *
 *   node db/maintenance/deleteUser.js <userName>            report only
 *   node db/maintenance/deleteUser.js <userName> --apply    delete, in one transaction
 *
 * Deletes rows where user_id / doctor_id / patient_id equals the user's id
 * (this includes their doctor_profiles row and any doctor<->patient links,
 * whether they were the doctor or the patient), then the users row itself.
 * Refuses to delete the last admin. Take a backup first. Irreversible.
 *
 * Also called by the app: DELETE /auth/account (routes/auth.js) runs
 * main(userName, true, () => {}) after checking the person's password. The
 * ids of the remaining users are NOT renumbered here; the weekly rebuild
 * (scheduleRebuild.js) closes the gap, with test accounts last.
 */
const { USER_COLS, q, qt, makePool, findRefColumns, isInnoDB, dbNames } = require('./idRefs');

async function main(userName, apply, log = console.log) {
  const gateway = dbNames().gateway;
  const pool = makePool();
  const conn = await pool.getConnection();
  try {
    const [users] = await conn.query(
      `SELECT id, userName, firstName, lastName, role FROM ${qt(gateway, 'users')} WHERE userName = ?`, [userName]);
    if (users.length === 0) throw new Error(`no user named "${userName}"`);
    const u = users[0];
    log(`User #${u.id}: ${u.userName} (${u.firstName} ${u.lastName}), role ${u.role}`);

    if (u.role === 'admin') {
      const [[a]] = await conn.query(`SELECT COUNT(*) AS n FROM ${qt(gateway, 'users')} WHERE role='admin' AND id <> ?`, [u.id]);
      if (Number(a.n) === 0) throw new Error('refusing to delete the last admin account');
    }


    // A church needs its owner. Refuse to delete the owner of a church until the
    // church is deleted (node db/approveChurch.js <id> delete). Members who are
    // not owners are removed with the other rows below (church.members.user_id).
    try {
      const church = dbNames().church;
      const [owned] = await conn.query(
        `SELECT c.id, c.name FROM ${qt(church, 'members')} m
           JOIN ${qt(church, 'churches')} c ON c.id = m.church_id
          WHERE m.user_id = ? AND m.role = 'owner'`, [u.id]);
      if (owned.length) {
        const err = new Error(`${u.userName} is the owner of church ${owned.map((c) => `#${c.id} "${c.name}"`).join(', ')}. ` +
          'Delete the church first: node db/approveChurch.js <id> delete');
        err.code = 'CHURCH_OWNER';
        throw err;
      }
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE' && e.code !== 'ER_BAD_DB_ERROR') throw e;   // church database not created yet
    }

    const refs = await findRefColumns(conn, USER_COLS);
    const plan = [];
    for (const r of refs) {
      const [[c]] = await conn.query(
        `SELECT COUNT(*) AS n FROM ${qt(r.schema, r.table)} WHERE ${q(r.column)} = ?`, [u.id]);
      if (Number(c.n) > 0) plan.push({ ...r, n: Number(c.n) });
    }

    log(apply ? 'Deleting:' : 'Would delete (report only, nothing changed):');
    for (const p of plan) log(`  ${p.schema}.${p.table}.${p.column}: ${p.n} row(s)`);
    log(`  ${gateway}.users: 1 row`);

    if (!apply) {
      log('\nRe-run with --apply to delete (take a backup first; this cannot be undone).');
      return { deleted: false, userId: u.id, rows: plan };
    }

    const bad = plan.filter((p) => !isInnoDB(p));
    if (bad.length) {
      throw new Error(`refusing to --apply: not InnoDB, so a transaction could not undo changes: ` +
        bad.map((b) => `${b.schema}.${b.table}`).join(', '));
    }

    await conn.beginTransaction();
    try {
      for (const p of plan) {
        await conn.query(`DELETE FROM ${qt(p.schema, p.table)} WHERE ${q(p.column)} = ?`, [u.id]);
      }
      const [res] = await conn.query(`DELETE FROM ${qt(gateway, 'users')} WHERE id = ?`, [u.id]);
      if (res.affectedRows !== 1) throw new Error('users row was not deleted');
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    }
    log(`\nDeleted user ${u.userName} and all of their data.`);
    return { deleted: true, userId: u.id, rows: plan };
  } finally {
    conn.release();
    await pool.end();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) { console.error('Usage: node db/maintenance/deleteUser.js <userName> [--apply]'); process.exit(1); }
  main(name, args.includes('--apply'))
    .then(() => process.exit(0))
    .catch((e) => { console.error('deleteUser failed:', e.message); process.exit(1); });
}

module.exports = main;
