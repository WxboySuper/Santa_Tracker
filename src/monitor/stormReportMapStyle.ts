import { Circle, Fill, Stroke, Style } from 'ol/style';
import type { ReportType } from '../types/stormReports';
import { STORM_REPORT_COLORS, STORM_REPORT_FALLBACK_COLOR } from '../utils/stormReportColors';

export const buildStormReportStyle = (type: ReportType): Style =>
  new Style({
    image: new Circle({
      radius: 6,
      fill: new Fill({
        color: STORM_REPORT_COLORS[type] ?? STORM_REPORT_FALLBACK_COLOR,
      }),
      stroke: new Stroke({
        color: '#FFFFFF',
        width: 1,
      }),
    }),
  });
