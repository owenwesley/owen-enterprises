import React, { useState } from 'react';
import TextField from '@mui/material/TextField';
import CheckBox from '@mui/material/Checkbox';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import {
  carbRatio,
  slidingScale1,
  slidingScale2a,
  slidingScale2b,
  slidingScale3a,
  slidingScale3b,
  slidingScale4a,
  slidingScale4b,
  slidingScale5,
  timesPD,
  height,
  typInsulin,
} from './Preference';
import { addButtonSx } from '../Styles';

export default function Preferences(props) {
  const edit = props.handleEditPreferences;
  const save = props.handleSavePreferences;

  const [tab, setTab] = useState(0);

  const isBPOnlyMode = props.timesPD === 1 || props.timesPD === 2;

  return (
    <div style={{
      backgroundColor: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      overflowY: 'auto',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {(props.timesPD === 1 && props.chkBP) || (props.timesPD === 2 && props.chkBP) ? (
          <h3 style={{ color: 'black' }}>Blood Pressure Tracking</h3>
        ) : (props.timesPD === 1 && !props.chkBP) || (props.timesPD === 2 && !props.chkBP) ? (
          <h3 style={{ color: 'black' }}>Blood Sugar Tracking</h3>
        ) : (
          <h3 style={{ color: 'black' }}>Tracking Options</h3>
        )}

        {!isBPOnlyMode && (
          <Tabs
            value={tab}
            onChange={(e, v) => setTab(v)}
            variant="fullWidth"
            style={{ marginBottom: 16 }}
          >
            <Tab label="Tracking Setup" />
            <Tab label="Medications & Insulin" />
          </Tabs>
        )}

        <TextField
          name='timesPD'
          select
          label='Times Per Day'
          value={props.timesPD}
          onChange={props.handlePreference}
          helperText='Please select your times Per Day'
          fullWidth
        >
          {timesPD.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        {isBPOnlyMode ? (
          <div>
            <CheckBox
              name='chkBP'
              checked={Boolean(props.chkBP)}
              disabled={false}
              onChange={props.handlePreference}
            />
            <label style={{ color: 'black' }} htmlFor='chkBloodPressure'>
              Blood Pressure
            </label>
          </div>
        ) : (
          <>
            {tab === 0 && (
              <div>
                <div>
                  <CheckBox
                    name='chkNutrition'
                    checked={Boolean(props.chkNutrition)}
                    disabled={false}
                    onChange={props.handlePreference}
                  />
                  <label style={{ color: 'black' }} htmlFor='chkNutrition'>
                    Count Carbs
                  </label>
                </div>

                {props.chkNutrition ? (
                  <div style={{ margin: '8px 0 12px' }}>
                    <TextField
                      name='calorieGoal'
                      type='number'
                      label='Daily Calorie Goal'
                      value={props.calorieGoal || ''}
                      onChange={props.handlePreference}
                      inputProps={{ min: 0, max: 20000, step: 50, inputMode: 'numeric' }}
                      helperText='Shows what is left in the Nutrition Day Total and colors each day. Leave blank for no goal.'
                      fullWidth
                    />
                  </div>
                ) : ''}

                {props.chkNutrition ? (
                  <div>
                    <CheckBox
                      name='chkWeight'
                      checked={Boolean(props.chkWeight)}
                      disabled={false}
                      onChange={props.handlePreference}
                    />
                    <label style={{ color: 'black' }} htmlFor='chkWeight'>
                      Track Weight
                    </label>
                  </div>
                ) : ''}

                {props.chkWeight ? (
                  <div>
                    <TextField
                      name='height'
                      select
                      label='Height in Inches'
                      value={props.height}
                      onChange={props.handlePreference}
                      helperText='Please select your height in inches'
                      fullWidth
                    >
                      {height.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </div>
                ) : ''}

                {props.height !== '0' ? (
                  <div>
                    <CheckBox
                      name='chkMeds'
                      checked={Boolean(props.chkMeds)}
                      disabled={false}
                      onChange={props.handlePreference}
                    />
                    <label style={{ color: 'black' }} htmlFor='chkMeds'>
                      Take Meds
                    </label>
                  </div>
                ) : ''}
              </div>
            )}

            {tab === 1 && (
              <div>
                {props.chkMeds ? (
                  <div>
                    <CheckBox
                      name='chkMedsB'
                      checked={Boolean(props.chkMedsB)}
                      disabled={false}
                      onChange={props.handlePreference}
                    />
                    <label style={{ color: 'black' }} htmlFor='chkMedsB'>
                      AM Meds
                    </label>
                    <CheckBox
                      name='chkMedsL'
                      checked={Boolean(props.chkMedsL)}
                      disabled={false}
                      onChange={props.handlePreference}
                    />
                    <label style={{ color: 'black' }} htmlFor='chkMedsL'>
                      Noon Meds
                    </label>
                    <CheckBox
                      name='chkMedsD'
                      checked={Boolean(props.chkMedsD)}
                      disabled={false}
                      onChange={props.handlePreference}
                    />
                    <label style={{ color: 'black' }} htmlFor='chkMedsD'>
                      Evening Meds
                    </label>
                    <CheckBox
                      name='chkMedsBed'
                      checked={Boolean(props.chkMedsBed)}
                      disabled={false}
                      onChange={props.handlePreference}
                    />
                    <label style={{ color: 'black' }} htmlFor='chkMedsBed'>
                      Bed Meds
                    </label>
                  </div>
                ) : ''}

                {props.chkMeds ? (
                  <div>
                    <CheckBox
                      name='chkInsulin'
                      checked={Boolean(props.chkInsulin)}
                      disabled={false}
                      onChange={props.handlePreference}
                    />
                    <label style={{ color: 'black' }} htmlFor='chkInsulin'>
                      Take Insulin
                    </label>
                  </div>
                ) : ''}

                {props.chkInsulin ? (
                  <div>
                    <TextField
                      name='typInsulin'
                      select
                      label='Types of Insulin'
                      value={props.typInsulin}
                      disabled={false}
                      onChange={props.handlePreference}
                      helperText='Please select how many types of insulin'
                      fullWidth
                    >
                      {typInsulin.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </div>
                ) : ''}

                {props.typInsulin === 1 || props.typInsulin === 2 ? (
                  <div>
                    <CheckBox
                      name='chkBP'
                      checked={Boolean(props.chkBP)}
                      disabled={false}
                      onChange={props.handlePreference}
                    />
                    <label style={{ color: 'black' }} htmlFor='chkBloodPressure'>
                      Blood Pressure (2X max)
                    </label>
                  </div>
                ) : ''}

                {props.chkBP ? (
                  <div>
                    <CheckBox
                      name='chkSlidingScale'
                      checked={Boolean(props.chkSlidingScale)}
                      disabled={false}
                      onChange={props.handlePreference}
                    />
                    <label style={{ color: 'black' }} htmlFor='chkSliddingScale'>
                      Sliding Scale
                    </label>
                  </div>
                ) : ''}

                {props.chkSlidingScale ? (
                  <div>
                    <div>
                      <TextField
                        name='slidingScale1'
                        select
                        label='Starting Slliding Scale'
                        value={props.slidingScale1}
                        disabled={false}
                        onChange={props.handlePreference}
                        helperText='Please enter the amount of sugar to start sliding scale'
                        fullWidth
                      >
                        {slidingScale1.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </div>
                    <div>
                      <TextField
                        name='slidingScale2a'
                        select
                        label='Sliding Scale'
                        value={props.slidingScale2a}
                        disabled={false}
                        onChange={props.handlePreference}
                        helperText='Please enter the amount of sugar to start sliding scale'
                      >
                        {slidingScale2a.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        name='slidingScale2b'
                        select
                        label='Sliding Scale'
                        value={props.slidingScale2b}
                        disabled={false}
                        onChange={props.handlePreference}
                        helperText='Please enter the amount of sugar to start sliding scale'
                      >
                        {slidingScale2b.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </div>
                    <div>
                      <TextField
                        name='slidingScale3a'
                        select
                        label='Sliding Scale'
                        value={props.slidingScale3a}
                        disabled={false}
                        onChange={props.handlePreference}
                        helperText='Please enter the amount of sugar to start sliding scale'
                      >
                        {slidingScale3a.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        name='slidingScale3b'
                        select
                        label='Sliding Scale'
                        value={props.slidingScale3b}
                        disabled={false}
                        onChange={props.handlePreference}
                        helperText='Please enter the amount of sugar to start sliding scale'
                      >
                        {slidingScale3b.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </div>
                    <div>
                      <TextField
                        name='slidingScale4a'
                        select
                        label='Sliding Scale'
                        value={props.slidingScale4a}
                        disabled={false}
                        onChange={props.handlePreference}
                        helperText='Please enter the amount of sugar to start sliding scale'
                      >
                        {slidingScale4a.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        name='slidingScale4b'
                        select
                        label='Sliding Scale'
                        value={props.slidingScale4b}
                        disabled={false}
                        onChange={props.handlePreference}
                        helperText='Please enter the amount of sugar to start sliding scale'
                      >
                        {slidingScale4b.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </div>
                    <div>
                      <TextField
                        name='slidingScale5'
                        select
                        label='Sliding Scale'
                        value={props.slidingScale5}
                        disabled={false}
                        onChange={props.handlePreference}
                        helperText='Please enter the amount of sugar to start sliding scale'
                        fullWidth
                      >
                        {slidingScale5.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </div>
                    <TextField
                      name='carbRatio'
                      select
                      label='Carb Ratio'
                      value={props.carbRatio}
                      disabled={false}
                      onChange={props.handlePreference}
                      helperText='Please enter how many carbs to 1 unit of insulin'
                      fullWidth
                    >
                      {carbRatio.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </div>
                ) : ''}
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <Button
            sx={addButtonSx}
            variant='contained'
            onClick={edit}
          >
            Edit
          </Button>
          <Button
            style={{ backgroundColor: '#a5d6a7', borderRadius: '50px' }}
            variant='contained'
            onClick={save}
          >
            Save
          </Button>
        </div>

      </div>
    </div>
  );
}
