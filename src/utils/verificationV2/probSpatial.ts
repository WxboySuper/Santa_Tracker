/**
 * Probability-skill, spatial-contingency, and false-alarm-discipline components
 * (PR 03 — prob-spatial). Re-exported from focused modules for a stable import path.
 */

export { evaluateGrid, isGradableEvaluation, roundTo, type GridEvaluation } from './gridEvaluation';
export { scoreProbabilitySkill } from './probabilitySkill';
export { scoreSpatialContingency } from './spatialContingency';
export { scoreFalseAlarmDiscipline } from './farDiscipline';
export type { AreaPolygon } from './neighborhood';
