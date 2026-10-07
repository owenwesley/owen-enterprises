/**
 * config/hipaaForms.js
 *
 * The forms a person accepts before BGTracker health data is available
 * (see middleware/hipaaGate.js). To change wording later, RAISE `version`:
 * everyone is asked again and the old acceptances stay in hipaa_consents.
 *
 * RULE: only state what the software really does. Each protection claimed below
 * is backed by code, listed here so it can be re-checked before editing the text:
 *   - signing in needs a password and a code texted to your phone (Twilio Verify) ... routes/mfa.js,
 *     utils/smsVerify.js, middleware/hipaaGate.js
 *   - "remember this device" skips the text for 30 days, password still required ... utils/mfaDevices.js
 *   - every access to health data is logged ....................... middleware/hipaaGate.js, audit_log
 *   - passwords stored hashed (bcrypt) ............................. routes/auth.js
 *   - doctors see only what you share, and only if linked ........... middleware/patientAccess.js
 *   - HTTPS ......... depends on HOW IT IS HOSTED: only true when the site is served
 *                     over HTTPS with FORCE_HTTPS=on in .env (middleware/forceHttps.js)
 *   - NOT claimed: encryption of stored health data (the database is not encrypted by this
 *     software), end-to-end encryption, or any AI processing.
 *
 * Fill in [PRIVACY CONTACT EMAIL] before turning the gate on.
 */
const FORMS = [
  {
    key: 'bgtracker_privacy_notice',
    version: '2',
    title: 'BGTracker privacy notice',
    text: [
      'What we store',
      'BGTracker stores the health information you enter: blood sugar readings, carbohydrates, insulin, blood pressure, weight, medications and nutrition notes, and your preferences. We also store your account details (name, username, email).',
      '',
      'Who else handles your information',
      'We use Twilio to send the text messages. Twilio receives your phone number and the code it sends. Your health information is not sent to Twilio.',
      '',
      'Who can see it',
      'You can. A doctor can see your information only if you have linked them as your doctor, and only the kinds of information you have chosen to share with them. We do not sell your information, and we do not send it to advertisers or to AI services.',
      '',
      'How we protect it',
      'Signing in requires your password and a code sent by text message to your phone. If you choose "remember this device", the text is skipped on that device for 30 days, but your password is still required; you can forget remembered devices at any time. Your password is stored in scrambled (hashed) form. Information travels over HTTPS. Every time health information is viewed, who viewed it and when is recorded in an access log. Access is limited to the people described above.',
      '',
      'What we do not do',
      'The stored health information itself is not separately encrypted in the database. If you are not comfortable with that, do not enter information you consider too sensitive.',
      '',
      'Keeping and deleting',
      'We keep your information until you delete it or delete your account. Deleting your account removes your information, including the access log entries about it.',
      '',
      'Questions',
      'Contact [PRIVACY CONTACT EMAIL].',
    ].join('\n'),
  },
  {
    key: 'bgtracker_consent',
    version: '2',
    title: 'Consent to store and share health information',
    text: [
      'By accepting I confirm that:',
      '1. I choose to enter my own health information into BGTracker, and I agree it is stored as described in the privacy notice.',
      '2. If I link a doctor, I agree they can see the kinds of information I share with them, and I can stop sharing at any time.',
      '3. I understand that viewing of my information is recorded in an access log.',
      '4. BGTracker is a record-keeping tool. It does not give medical advice and is not a substitute for my doctor.',
      '',
      'I can delete my information or my account at any time.',
    ].join('\n'),
  },
];

module.exports = { FORMS };
