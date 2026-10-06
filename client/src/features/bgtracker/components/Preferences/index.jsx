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

// Inside sx, plain numbers are theme units (8px each), so px strings are used on purpose.
// A checkbox and its label. The id matches the label's htmlFor, so tapping the words toggles the box.
function Check({ name, checked, onChange, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', marginRight: '8px' }}>
      <CheckBox
        id={name}
        name={name}
        size='small'
        sx={{ padding: '4px' }}
        checked={Boolean(checked)}
        onChange={onChange}
      />
      <label style={{ color: 'black' }} htmlFor={name}>{children}</label>
    </span>
  );
}

// One small dropdown. Used for every select on this page.
function Pick({ name, label, value, options, onChange, ...rest }) {
  return (
    <TextField
      name={name}
      select
      size='small'
      label={label}
      value={value}
      onChange={onChange}
      fullWidth
      {...rest}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

const gridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '8px 0' };
const tabSx = { minHeight: '36px', padding: '6px 4px', fontSize: '0.7rem', letterSpacing: 0 };

export default function Preferences(props) {
  const edit = props.handleEditPreferences;
  const save = props.handleSavePreferences;
  const change = props.handlePreference;

  const [tab, setTab] = useState(0);

  const isBPOnlyMode = props.timesPD === 1 || props.timesPD === 2;

  return (
    <div style={{
      backgroundColor: 'white',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Only this part scrolls. Edit and Save sit below it, so they are always on screen.
          margin auto centres the content and never cuts off the top on a short window. */}
      <div style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 16px 4px',
      }}>
      <div style={{ width: '100%', maxWidth: 480, margin: 'auto' }}>

        {(props.timesPD === 1 && props.chkBP) || (props.timesPD === 2 && props.chkBP) ? (
          <h3 style={{ color: 'black', margin: '0 0 8px' }}>Blood Pressure Tracking</h3>
        ) : (props.timesPD === 1 && !props.chkBP) || (props.timesPD === 2 && !props.chkBP) ? (
          <h3 style={{ color: 'black', margin: '0 0 8px' }}>Blood Sugar Tracking</h3>
        ) : (
          <h3 style={{ color: 'black', margin: '0 0 8px' }}>Tracking Options</h3>
        )}

        {!isBPOnlyMode && (
          <Tabs
            value={tab}
            onChange={(e, v) => setTab(v)}
            variant='fullWidth'
            sx={{ minHeight: '36px', marginBottom: '8px' }}
          >
            <Tab sx={tabSx} label='Tracking Setup' />
            <Tab sx={tabSx} label='Medications & Insulin' />
          </Tabs>
        )}

        <Pick name='timesPD' label='Times Per Day' value={props.timesPD} options={timesPD} onChange={change} />

        {isBPOnlyMode ? (
          <div>
            <Check name='chkBP' checked={props.chkBP} onChange={change}>Blood Pressure</Check>
          </div>
        ) : (
          <>
            {tab === 0 && (
              <div>
                <div>
                  <Check name='chkNutrition' checked={props.chkNutrition} onChange={change}>Count Carbs</Check>
                </div>

                {props.chkNutrition ? (
                  <div style={{ margin: '4px 0 8px' }}>
                    <TextField
                      name='calorieGoal'
                      type='number'
                      size='small'
                      label='Daily Calorie Goal'
                      value={props.calorieGoal || ''}
                      onChange={change}
                      inputProps={{ min: 0, max: 20000, step: 50, inputMode: 'numeric' }}
                      helperText='Shows what is left in the Nutrition Day Total and colors each day. Leave blank for no goal.'
                      fullWidth
                    />
                  </div>
                ) : ''}

                {props.chkNutrition ? (
                  <div>
                    <Check name='chkWeight' checked={props.chkWeight} onChange={change}>Track Weight</Check>
                  </div>
                ) : ''}

                {props.chkWeight ? (
                  <div style={{ margin: '4px 0 8px' }}>
                    <Pick name='height' label='Height in Inches' value={props.height} options={height} onChange={change} />
                  </div>
                ) : ''}

                {props.height !== '0' ? (
                  <div>
                    <Check name='chkMeds' checked={props.chkMeds} onChange={change}>Take Meds</Check>
                  </div>
                ) : ''}
              </div>
            )}

            {tab === 1 && (
              <div>
                {props.chkMeds ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    <Check name='chkMedsB' checked={props.chkMedsB} onChange={change}>AM Meds</Check>
                    <Check name='chkMedsL' checked={props.chkMedsL} onChange={change}>Noon Meds</Check>
                    <Check name='chkMedsD' checked={props.chkMedsD} onChange={change}>Evening Meds</Check>
                    <Check name='chkMedsBed' checked={props.chkMedsBed} onChange={change}>Bed Meds</Check>
                  </div>
                ) : ''}

                {props.chkMeds ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                    <Check name='chkInsulin' checked={props.chkInsulin} onChange={change}>Take Insulin</Check>
                    {props.chkInsulin ? (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Pick name='typInsulin' label='Types of Insulin' value={props.typInsulin} options={typInsulin} onChange={change} />
                      </div>
                    ) : ''}
                  </div>
                ) : ''}

                {props.typInsulin === 1 || props.typInsulin === 2 ? (
                  <div>
                    <Check name='chkBP' checked={props.chkBP} onChange={change}>Blood Pressure (2X max)</Check>
                  </div>
                ) : ''}

                {props.chkBP ? (
                  <div>
                    <Check name='chkSlidingScale' checked={props.chkSlidingScale} onChange={change}>Sliding Scale</Check>
                  </div>
                ) : ''}

                {props.chkSlidingScale ? (
                  <div>
                    <div style={{ color: 'black', fontSize: '0.8rem', margin: '4px 0' }}>
                      Pick the sugar level where each sliding scale step starts.
                    </div>
                    <div style={gridStyle}>
                      <div style={{ gridColumn: '1 / span 2' }}>
                        <Pick name='slidingScale1' label='Starting Sliding Scale' value={props.slidingScale1} options={slidingScale1} onChange={change} />
                      </div>
                      <Pick name='slidingScale2a' label='Sliding Scale' value={props.slidingScale2a} options={slidingScale2a} onChange={change} />
                      <Pick name='slidingScale2b' label='Sliding Scale' value={props.slidingScale2b} options={slidingScale2b} onChange={change} />
                      <Pick name='slidingScale3a' label='Sliding Scale' value={props.slidingScale3a} options={slidingScale3a} onChange={change} />
                      <Pick name='slidingScale3b' label='Sliding Scale' value={props.slidingScale3b} options={slidingScale3b} onChange={change} />
                      <Pick name='slidingScale4a' label='Sliding Scale' value={props.slidingScale4a} options={slidingScale4a} onChange={change} />
                      <Pick name='slidingScale4b' label='Sliding Scale' value={props.slidingScale4b} options={slidingScale4b} onChange={change} />
                      <Pick name='slidingScale5' label='Sliding Scale' value={props.slidingScale5} options={slidingScale5} onChange={change} />
                      <Pick name='carbRatio' label='Carb Ratio (g/unit)' value={props.carbRatio} options={carbRatio} onChange={change} />
                    </div>
                  </div>
                ) : ''}
              </div>
            )}
          </>
        )}

      </div>
      </div>

      <div style={{ flex: '0 0 auto', padding: '8px 16px 12px', borderTop: '1px solid #e0e0e0' }}>
        <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', display: 'flex', gap: 8 }}>
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
