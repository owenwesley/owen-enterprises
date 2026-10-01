import React from 'react';

const Help = () => {
  return (
    <div style={{ backgroundColor: 'white' }}>
      <h1>Help</h1>
      <hr />
      <p style={helpText.p}>
        Thank you for trying My Diabetes Data Doctors app.
      </p>
      <p style={helpText.p}>
        If you are a returning user, please enter your login credentials on the
        home screen under Login.
      </p>
      <p style={helpText.p}>
        If this is your initial visit, then the first thing you need to do is
        click on the <strong>Register</strong> tab next to the{' '}
        <strong>Login</strong> tab and input your information. Please take note
        of your User Name and Password. You’ll want to keep these in a safe
        place so you can return and update as needed.
      </p>
      <p style={helpText.p}>
        After you finish registering, you’ll need to return to the home screen
        and log in. Next, you will need to click on the{' '}
        <strong>Preferences</strong> button at the top of the screen. On this
        page, you will choose how often you test and/or treat under{' '}
        <strong>Times Per Day</strong>, up to 5. Next, you will select to{' '}
        <strong>Count Carbs</strong>{' '}
        or not, then whether you <strong>Take Insulin</strong> or not. If you do
        not take Insulin, then you can skip to <strong>Blood Pressure</strong>.
        If you do take Insulin, then under <strong>Types of Insulin</strong>,
        you will choose whether you use one or two types of Insulin. Finally,
        you can also choose to track your <strong>Blood Pressure</strong> once a
        day. After all your choices are made, you will click on the EDIT button.
      </p>
      <p style={helpText.p}>
        If you do not take Insulin, you can click on the{' '}
        <strong>BGTracker</strong> button at the top of the page. On this page,
        you input the Date, Sugar Count, Carbs, types of Insulin, and amounts.
        If you chose to track Blood Pressure, your Systolic/Diastolic numbers,
        and Heart Rate(HR) will be entered here as well.
      </p>
      <p style={helpText.p}>
        Also, if you take any medications including Insulin, you can now go over
        to the <strong>Medications</strong> page by clicking on the{' '}
        <strong>Medications</strong> button at the top of the page. Here you can
        input the information about the Prescriber, Dose, Quantity, and the time
        of day you take your Insulin.
      </p>
      <p style={helpText.p}>
        Now you are all set up and can return as often as you need to to update
        your numbers.
      </p>
    </div>
  );
};

const helpText = {
  p: {
    marginLeft: '1rem',
    padding: '1rem',
    textAlign: 'left',
    fontSize: '2rem',
  },
};

export default Help;
