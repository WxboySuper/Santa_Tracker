import type { MonitorOutlookSourceSelection } from '../types';

/** Formats monitor layer timestamps for compact control-panel status text. */
export function formatLayerTime(time?: string): string {
  if (!time) {
    return 'Latest time unavailable';
  }

  const parsed = new Date(time);
  if (Number.isNaN(parsed.getTime())) {
    return time;
  }

  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

/** Serializes an outlook source selection for select input values. */
export const sourceValue = (source: MonitorOutlookSourceSelection): string => `${source.kind}:${source.id}`;

const OUTLOOK_SOURCE_KINDS = new Set<MonitorOutlookSourceSelection['kind']>([
  'current',
  'local-cycle',
  'cloud-cycle',
]);

/** Parses a monitor outlook source selection from a select input value. */
export const parseSourceValue = (value: string): MonitorOutlookSourceSelection => {
  const [kind, ...idParts] = value.split(':');
  const id = idParts.join(':') || 'current';
  if (OUTLOOK_SOURCE_KINDS.has(kind as MonitorOutlookSourceSelection['kind'])) {
    return { kind: kind as MonitorOutlookSourceSelection['kind'], id };
  }

  return { kind: 'current', id: 'current' };
};

/** Formats the NWS alert layer count and animation frame status. */
export const formatAlertsStatusLine = (
  polygonCount: number,
  frameCount: number,
  frameIndex: number,
): string => {
  const polygonLabel = `${polygonCount} polygon${polygonCount === 1 ? '' : 's'}`;
  if (frameCount <= 1) {
    return polygonLabel;
  }

  return `${polygonLabel} · frame ${frameIndex + 1}/${frameCount}`;
};

/** Formats the visible and total SPC storm report counts. */
export const formatStormReportsStatusLine = (
  shownCount: number,
  totalCount: number,
): string => {
  if (totalCount === shownCount) {
    return `${shownCount} shown today`;
  }

  return `${shownCount} shown (${totalCount} total today)`;
};
