const express = require('express');
const { church: db, owenenterprises: gateway } = require('../../db/db');
const { selectContactSharers } = require('../../db/sql/church/members');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

// GET /church/contacts/:user_id
// Live list for the Contacts page: nothing is copied into anyone's contacts table, so a person
// who leaves, is removed, switches sharing off or whose church is suspended is gone at once.
// Only: church name, first/last name, account email, the phone and address they chose to share.
// No user ids. One entry per person (church names joined if they share several churches).
router.get('/:user_id', async (req, res) => {
  try {
    const [rows] = await db.promise().query(selectContactSharers, [req.user.id, req.user.id]);
    if (!rows.length) return res.json({ results: [] });
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const [users] = await gateway.promise().query('SELECT id, firstName, lastName, email FROM users WHERE id IN (?)', [ids]);
    const byId = new Map(users.map((u) => [u.id, u]));
    const seen = new Map();
    for (const r of rows) {
      const u = byId.get(r.user_id);
      if (!u) continue;
      const prev = seen.get(r.user_id);
      if (prev) { if (!prev.churches.includes(r.churchName)) prev.churches.push(r.churchName); continue; }
      seen.set(r.user_id, {
        key: `church-${r.memberId}`,
        firstName: u.firstName, lastName: u.lastName, email: u.email || '',
        phoneNum: r.contactPhone || '', address: r.contactAddress || '',
        churches: [r.churchName],
      });
    }
    const results = [...seen.values()]
      .map((x) => ({ ...x, church: x.churches.join(', ') }))
      .map(({ churches, ...rest }) => rest)
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
