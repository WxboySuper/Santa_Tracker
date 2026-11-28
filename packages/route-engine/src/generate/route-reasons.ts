import { haversineKm, type LatLng } from '../geo';
import { classifyRegion } from './regions';
import type { Candidate } from './types';

type LongLegReasonOptions = {
  reinsertionChecked?: boolean;
};

function coverageDescription(destination: Candidate): string {
  return destination.mandatoryCoverageStop ? 'mandatory country/admin-1 coverage' : 'selected stop';
}

function insertionDescription(options: LongLegReasonOptions): string {
  return options.reinsertionChecked ? '; best feasible insertion checked' : '';
}

function isOceanCrossing(origin: Candidate, destination: Candidate): boolean {
  const fromRegion = classifyRegion(origin);
  const toRegion = classifyRegion(destination);
  if (fromRegion.continent !== toRegion.continent) return true;
  if (fromRegion.pacificIsland) return true;
  return toRegion.pacificIsland;
}

function deliveryReason(origin: Candidate, destination: Candidate, options: LongLegReasonOptions): string {
  const coverage = coverageDescription(destination);
  const suffix = insertionDescription(options);
  if (isOceanCrossing(origin, destination)) {
    return 'ocean crossing ' + origin.country + ' to ' + destination.country + ' for ' + coverage + suffix;
  }
  if (origin.country !== destination.country) {
    return 'country coverage ' + origin.country + ' to ' + destination.country + ' for ' + coverage + suffix;
  }
  return 'regional transfer within ' + destination.country + ' for ' + coverage + suffix;
}

export function longLegReason(
  from: Candidate | LatLng,
  to: Candidate | LatLng,
  options: LongLegReasonOptions = {},
): string | undefined {
  if (haversineKm(from, to) <= 3_000) return undefined;
  if (!('country' in from)) {
    if (!('country' in to)) return 'polar launch';
    return 'polar launch to ' + to.country + insertionDescription(options);
  }
  if (!('country' in to)) return 'polar return from ' + from.country;
  return deliveryReason(from, to, options);
}

export function hasSpecificLongLegReason(reason: string | undefined): boolean {
  if (!reason || reason.includes('soft-orienteering')) return false;
  const isPolarReason = reason.startsWith('polar launch to ') || reason.startsWith('polar return from ');
  const isDeliveryReason = reason.startsWith('ocean crossing ')
    || reason.startsWith('country coverage ')
    || reason.startsWith('regional transfer within ');
  return isPolarReason || isDeliveryReason;
}
