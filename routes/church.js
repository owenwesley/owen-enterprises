/**
 * routes/church.js  (mounted at /church in server.js)
 *
 * Index only. Each area lives in routes/church/<area>.js, with one file per action where an area has
 * several (the same layout as routes/bgtracker and routes/communitylibrary). Shared helpers are in
 * routes/church/_helpers.js. Full API list and the notes on privacy: README.md ("Church").
 *
 * Every path ends with the signed-in user's id (server.js puts auth + ownerOnly in front). Routes that
 * act INSIDE a church also carry :church_id and go through requireChurch(permission)
 * (middleware/church.js). The routers under /:church_id/... use mergeParams so they can read it.
 *
 *   GET  /church/mine/:user_id                                   my churches
 *   POST /church/create/:user_id                                 request a new church (pending)
 *   POST /church/join/:user_id                                   ask to join with a code (pending)
 *   GET  /church/shared-library/:user_id                         books and movies other members shared (read-only)
 *   GET  /church/contacts/:user_id                               members who shared their contact info
 *   POST /church/borrow/{request,answer,cancel,clear}/:user_id   ask to borrow / answer / cancel / clear
 *   GET  /church/borrow/:user_id, /church/borrow-count/:user_id  my requests, the nav badge count
 *   GET  /church/:church_id/members/:user_id                     members.view
 *   POST /church/:church_id/members/{approve,remove,role}/:user_id
 *   POST /church/:church_id/edit/:user_id                        church.edit     { missionStatement }
 *   POST /church/:church_id/leave/:user_id                       leave (or withdraw a request)
 *   POST /church/:church_id/joincode/reset/:user_id              joincode.reset
 *   POST /church/:church_id/transfer/:user_id                    church.transfer { memberId, password }
 *   POST /church/:church_id/areas/:user_id                       areas.manage    (owner only)
 *   GET  /church/:church_id/library/:user_id                     library.view
 *   POST /church/:church_id/library/share/:user_id               library.share
 *   POST /church/:church_id/contact/share/:user_id               contact.share
 *   GET  /church/:church_id/announcements/:user_id               announcements.view
 *   POST /church/:church_id/announcements/{post,edit,delete}/:user_id   announcements.post
 *
 * ORDER MATTERS: the fixed paths (mine, create, join, shared-library, contacts, borrow, borrow-count) come
 * first so they can never be read as a :church_id. tests/route-layout.js (npm run check:routes) checks the whole list.
 */
const express = require('express');
const router  = express.Router();

// Fixed paths first.
router.use('/mine',           require('./church/mine'));
router.use('/create',         require('./church/create'));
router.use('/join',           require('./church/join'));
router.use('/shared-library', require('./church/sharedLibrary'));
router.use('/contacts',       require('./church/contacts'));
router.use('/borrow',         require('./church/borrow'));
router.use('/borrow-count',   require('./church/borrowCount'));

// Inside one church.
router.use('/:church_id/members',       require('./church/members'));
router.use('/:church_id/edit',          require('./church/edit'));
router.use('/:church_id/leave',         require('./church/leave'));
router.use('/:church_id/joincode',      require('./church/joincode'));
router.use('/:church_id/transfer',      require('./church/transfer'));
router.use('/:church_id/areas',         require('./church/areas'));
router.use('/:church_id/library',       require('./church/library'));
router.use('/:church_id/contact',       require('./church/contact'));
router.use('/:church_id/announcements', require('./church/announcements'));

module.exports = router;
