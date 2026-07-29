/**
 * Public surface of the gfc-ver-1 Forecast Grade engine.
 *
 * The engine is pure (no React, no Redux) so it can be unit-tested in isolation
 * and imported by UI, history persistence, share/export, and docs tooling.
 */
export * from './formulaVersion';
export * from './constants';
export * from './gradeContract';
export {
  extractProductContours,
  reportsForProduct,
  relevantReportTypes,
  isSignificantReport,
  isSignificantKey,
  probabilityFromKey,
  parseMagnitude,
  observedFootprint,
  buildVerificationGrid,
  type ProductContour,
  type VerificationGrid,
  type AreaPolygon,
} from './neighborhood';
export {
  evaluateGrid,
  scoreProbabilitySkill,
  scoreSpatialContingency,
  scoreFalseAlarmDiscipline,
  type GridEvaluation,
} from './probSpatial';
export { scoreEventYield, scoreSeverity } from './yieldSeverity';
export {
  gradeProduct,
  rollUpPackageGrade,
  assessDataQuality,
  buildPackageGrade,
  type DataQualityAssessment,
  type BuildPackageOptions,
} from './composite';
export {
  gradeForecast,
  runForecastGrade,
  validateGradeInputs,
  type GradeForecastInput,
  type GradeInputValidation,
  type GradeProgress,
  type GradeProgressHandler,
} from './gradeForecast';
