/**
 * utils/featureDefaults.js
 *
 * Which modules a brand-new account starts with. Not everyone who uses this site is a
 * patient: BG Tracker (and with it the HIPAA gate, consent forms and audit logging) is
 * OFF for an ordinary sign-up, so they are a "member" until they switch it on in
 * Feature Preferences. Library and Meetings stay on, Church stays off (unchanged).
 *
 * Doctors start with BG Tracker ON: hipaaGate checks the flag of the person acting as
 * well as the patient, so a doctor with it off would get BGTRACKER_DISABLED on every
 * patient route.
 */
function defaultFeaturePrefs(role) {
  return {
    chkBgtracker:        role === 'doctor' ? 1 : 0,
    chkCommunityLibrary: 1,
    chkMeetings:         1,
    chkChurch:           0,
  };
}

module.exports = { defaultFeaturePrefs };
