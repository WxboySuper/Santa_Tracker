import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { OutlookType } from '../types/outlooks';
import type { LandMaskStrategy } from '../utils/outlookPolygonMasking/types';

export type BaseMapStyle = 'osm' | 'carto-light' | 'carto-dark' | 'esri-satellite' | 'blank';

export interface OverlaysState {
  stateBorders: boolean;
  counties: boolean;
  baseMapStyle: BaseMapStyle;
  ghostOutlooks: Record<OutlookType, boolean>;
  /** Prototype (#619): trim outlook polygons to land; default off. */
  outlookTrimStrategy: LandMaskStrategy;
  /** Prototype (#619): trim geometry when finishing draw/modify. */
  outlookTrimAutoOnDraw: boolean;
  /** Prototype (#619): show trimmed preview layer without mutating stored geometry. */
  outlookTrimPreviewOnly: boolean;
}

const initialState: OverlaysState = {
  stateBorders: true, // Default to showing state borders
  counties: false,
  baseMapStyle: 'osm',
  outlookTrimStrategy: 'us-country-minus-great-lakes',
  outlookTrimAutoOnDraw: false,
  outlookTrimPreviewOnly: false,
  ghostOutlooks: {
    tornado: false,
    wind: false,
    hail: false,
    categorical: false,
    totalSevere: false,
    'day4-8': false,
  },
};

/** True when two ghost-outlook visibility maps contain the same values. */
const areGhostOutlooksEqual = (
  left: Record<OutlookType, boolean>,
  right: Record<OutlookType, boolean>
): boolean =>
  (Object.keys(left) as OutlookType[]).every((key) => left[key] === right[key]);

const overlaysSlice = createSlice({
  name: 'overlays',
  initialState,
  reducers: {
    toggleStateBorders: (state) => {
      state.stateBorders = !state.stateBorders;
    },
    toggleCounties: (state) => {
      state.counties = !state.counties;
    },
    setOverlay: (state, action: PayloadAction<{ layer: 'stateBorders' | 'counties'; visible: boolean }>) => {
      state[action.payload.layer] = action.payload.visible;
    },
    setBaseMapStyle: (state, action: PayloadAction<BaseMapStyle>) => {
      state.baseMapStyle = action.payload;
    },
    toggleGhostOutlook: (state, action: PayloadAction<OutlookType>) => {
      const outlookType = action.payload;
      state.ghostOutlooks[outlookType] = !state.ghostOutlooks[outlookType];
    },
    setGhostOutlookVisibility: (state, action: PayloadAction<{ outlookType: OutlookType; visible: boolean }>) => {
      const { outlookType, visible } = action.payload;
      state.ghostOutlooks[outlookType] = visible;
    },
    setOutlookTrimStrategy: (state, action: PayloadAction<LandMaskStrategy>) => {
      state.outlookTrimStrategy = action.payload;
    },
    setOutlookTrimAutoOnDraw: (state, action: PayloadAction<boolean>) => {
      state.outlookTrimAutoOnDraw = action.payload;
    },
    toggleOutlookTrimAutoOnDraw: (state) => {
      state.outlookTrimAutoOnDraw = !state.outlookTrimAutoOnDraw;
    },
    setOutlookTrimPreviewOnly: (state, action: PayloadAction<boolean>) => {
      state.outlookTrimPreviewOnly = action.payload;
    },
    toggleOutlookTrimPreviewOnly: (state) => {
      state.outlookTrimPreviewOnly = !state.outlookTrimPreviewOnly;
    },
    // @codescene(disable:"Complex Method")
    applyOverlaySettings: (state, action: PayloadAction<Partial<OverlaysState>>) => {
      const {
        stateBorders,
        counties,
        baseMapStyle,
        ghostOutlooks,
        outlookTrimStrategy,
        outlookTrimAutoOnDraw,
        outlookTrimPreviewOnly,
      } = action.payload;

      if (typeof stateBorders === 'boolean') {
        state.stateBorders = stateBorders;
      }

      if (typeof counties === 'boolean') {
        state.counties = counties;
      }

      if (baseMapStyle) {
        state.baseMapStyle = baseMapStyle;
      }

      if (outlookTrimStrategy) {
        state.outlookTrimStrategy = outlookTrimStrategy;
      }

      if (typeof outlookTrimAutoOnDraw === 'boolean') {
        state.outlookTrimAutoOnDraw = outlookTrimAutoOnDraw;
      }

      if (typeof outlookTrimPreviewOnly === 'boolean') {
        state.outlookTrimPreviewOnly = outlookTrimPreviewOnly;
      }

      if (ghostOutlooks && !areGhostOutlooksEqual(state.ghostOutlooks, {
        ...state.ghostOutlooks,
        ...ghostOutlooks,
      })) {
        state.ghostOutlooks = {
          ...state.ghostOutlooks,
          ...ghostOutlooks,
        };
      }
    },
    resetOverlays: () => initialState,
  },
});

export const {
  toggleStateBorders,
  toggleCounties,
  setOverlay,
  setBaseMapStyle,
  toggleGhostOutlook,
  setGhostOutlookVisibility,
  setOutlookTrimStrategy,
  setOutlookTrimAutoOnDraw,
  toggleOutlookTrimAutoOnDraw,
  setOutlookTrimPreviewOnly,
  toggleOutlookTrimPreviewOnly,
  applyOverlaySettings,
  resetOverlays,
} = overlaysSlice.actions;

export default overlaysSlice.reducer;
