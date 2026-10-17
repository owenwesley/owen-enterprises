/**
 * utils/featureDefaults.js
 *
 * Which modules a brand-new account starts with. Not everyone who uses this site is a
 * patient, so an ordinary sign-up starts with EVERYTHING off and is sent to Feature
 * access on first sign-in to choose (featuresChosen = 0 is what triggers that).
 * Until BG Tracker is switched on they are a "member": no BG Tracker card, no My doctors,
 * and no HIPAA gate, consent forms or audit logging apply to them.
 *
 * Doctors start with BG Tracker ON (hipaaGate checks the flag of the person acting as
 * well as the patient, so a doctor with it off would get BGTRACKER_DISABLED on every
 * patient route), keep Library and Meetings on as before, and skip the first-sign-in
 * prompt (featuresChosen = 1).
 *
 * featuresChosen: 0 = has never saved Feature access, 1 = has. The column's own default is 1,
 * so accounts that existed before 1.13.11 are never prompted; only the two places that
 * create a row for a NEW account (signup, first GET) write 0 explicitly.
 */
function defaultFeaturePrefs(role) {
  const doctor = role === 'doctor';
  return {
    chkBgtracker:        doctor ? 1 : 0,
    chkCommunityLibrary: doctor ? 1 : 0,
    chkMeetings:         doctor ? 1 : 0,
    chkChurch:           0,
    featuresChosen:      doctor ? 1 : 0,
  };
}

module.exports = { defaultFeaturePrefs };
