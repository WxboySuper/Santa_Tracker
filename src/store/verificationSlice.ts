import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ForecastCycle, OutlookData, DayType } from '../types/outlooks';
import { RootState } from './index';

interface VerificationState {
  loadedForecast: ForecastCycle | null;
}

const initialState: VerificationState = {
  loadedForecast: null,
};

// Keep the empty result stable so useSelector can bail out when no outlook exists.
const EMPTY_VERIFICATION_OUTLOOKS = Object.freeze({}) as OutlookData;

const verificationSlice = createSlice({
  name: 'verification',
  initialState,
  reducers: {
    loadVerificationForecast: (state, action: PayloadAction<ForecastCycle>) => {
      state.loadedForecast = action.payload;
    },
    clearVerificationForecast: (state) => {
      state.loadedForecast = null;
    },
  },
});

export const { loadVerificationForecast, clearVerificationForecast } = verificationSlice.actions;

// Selectors
export const selectVerificationForecast = (state: RootState) => state.verification.loadedForecast;

export const selectVerificationOutlooksForDay = (state: RootState, day: DayType) => {
  const forecast = state.verification.loadedForecast;
  const dayForecast = forecast?.days[day];
  if (!dayForecast) {
    return EMPTY_VERIFICATION_OUTLOOKS;
  }
  return dayForecast.data;
};

export default verificationSlice.reducer;
