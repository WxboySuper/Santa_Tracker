import type { StormReport } from '../../types/stormReports';
import { notEvaluatedComponent, scoredComponent, type ComponentScore } from './gradeContract';
import { roundTo } from './gridEvaluation';
import {
  areaKm2,
  intersectionAreaKm2,
  observedFootprint,
  unionAll,
  type ProductContour,
} from './neighborhood';

const tiersFrom = (contours: ProductContour[]): number[] =>
  Array.from(new Set(contours.map((contour) => contour.probability).filter((p) => p > 0))).sort(
    (a, b) => a - b
  );

/** Armchair-style area CSI averaged across probability tiers. */
export const scoreSpatialContingency = (
  contours: ProductContour[],
  reports: StormReport[]
): ComponentScore => {
  const forecastUnion = unionAll(contours.map((contour) => contour.polygon));
  const observed = observedFootprint(reports);

  if (!forecastUnion && !observed) {
    return notEvaluatedComponent('spatialContingency', 'No forecast area and no observed footprint.');
  }

  const observedArea = areaKm2(observed);
  const tiers = tiersFrom(contours);

  const perTierCsi: number[] = [];
  for (const tier of tiers) {
    const tierUnion = unionAll(
      contours.filter((contour) => contour.probability >= tier).map((contour) => contour.polygon)
    );
    const tierArea = areaKm2(tierUnion);
    const hit = intersectionAreaKm2(tierUnion, observed);
    const falseAlarm = Math.max(0, tierArea - hit);
    const miss = Math.max(0, observedArea - hit);
    const denom = hit + falseAlarm + miss;
    perTierCsi.push(denom > 0 ? hit / denom : 0);
  }

  const unionHit = intersectionAreaKm2(forecastUnion, observed);
  const unionArea = areaKm2(forecastUnion);
  const unionFalseAlarm = Math.max(0, unionArea - unionHit);
  const unionMiss = Math.max(0, observedArea - unionHit);
  const unionDenom = unionHit + unionFalseAlarm + unionMiss;
  const unionCsi = unionDenom > 0 ? unionHit / unionDenom : 0;

  const score = perTierCsi.length > 0
    ? perTierCsi.reduce((sum, value) => sum + value, 0) / perTierCsi.length
    : unionCsi;

  return scoredComponent(
    'spatialContingency',
    score,
    `CSI ${roundTo(unionCsi)} over ${roundTo(unionArea)} km² forecast vs ${roundTo(
      observedArea
    )} km² observed across ${tiers.length || 1} tier(s).`,
    {
      csi: roundTo(unionCsi),
      hitAreaKm2: roundTo(unionHit),
      falseAlarmAreaKm2: roundTo(unionFalseAlarm),
      missAreaKm2: roundTo(unionMiss),
      tiers: tiers.length,
    }
  );
};
