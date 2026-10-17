// Reads and checks { title, body } for posting or editing an announcement.
// Answers the request itself (400) and returns null when something is wrong.
const { clean, bad } = require('../_helpers');

const TITLE_MAX = 150;
const BODY_MAX = 4000;

function readAnnouncement(req, res) {
  const title = clean(req.body.title);
  const body = clean(req.body.body);
  if (!title) { bad(res, 'A title is required'); return null; }
  if (title.length > TITLE_MAX) { bad(res, `Title must be ${TITLE_MAX} characters or fewer`); return null; }
  if (body.length > BODY_MAX) { bad(res, `Message must be ${BODY_MAX} characters or fewer`); return null; }
  return { title, body };
}

module.exports = { readAnnouncement };
