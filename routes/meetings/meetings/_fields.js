// The 24 meeting values that add and edit both save, in the order db/sql/meetings/meetings.js expects
// (date ... deposit). add.js puts user_id in front of them; edit.js puts id and user_id after them.
const { toNum, toStr } = require('../../../utils/coerce');

function meetingValues(b) {
  return [
    b.date || '', toStr(b.chair) || 'N/A', toStr(b.coChair) || 'N/A',
    toNum(b.newComer), toNum(b.day30), toNum(b.day60), toNum(b.day90),
    toNum(b.month6), toNum(b.month9), toNum(b.month12), toNum(b.month18),
    toNum(b.multiyr),
    toNum(b.gc1), toNum(b.gc2), toNum(b.gc3), toNum(b.gc4), toNum(b.gc5),
    toNum(b.gc6), toNum(b.gc7), toNum(b.gc8), toNum(b.gc9), toNum(b.gc10),
    toNum(b.attendance), toStr(b.memo) || 'N/A', toNum(b.deposit),
  ];
}

module.exports = { meetingValues };
