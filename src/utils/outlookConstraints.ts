import type {
  CategoricalRiskLevel,
  CIGLevel,
  Day48Probability,
  DayType,
  HailProbability,
  OutlookType,
  TornadoProbability,
  TotalSevereProbability,
  WindProbability,
} from '../types/outlooks';

/** Probability options available for each outlook type across a forecast day. */
export interface OutlookConstraints {
  outlookTypes: readonly OutlookType[];
  allowsProbabilities: boolean;
  allowedCIG: readonly CIGLevel[];
  allowedCategorical: readonly CategoricalRiskLevel[];
  requiresConversion: boolean;
  probabilities: {
    tornado?: readonly TornadoProbability[];
    wind?: readonly WindProbability[];
    hail?: readonly HailProbability[];
    totalSevere?: readonly TotalSevereProbability[];
    'day4-8'?: readonly Day48Probability[];
  };
}

const CONSTRAINTS_BY_DAY = {
  1: {
    outlookTypes: ['tornado', 'wind', 'hail', 'categorical'],
    allowsProbabilities: true,
    allowedCIG: ['CIG1', 'CIG2', 'CIG3'],
    allowedCategorical: ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'],
    requiresConversion: true,
    probabilities: {
      tornado: ['2%', '5%', '10%', '15%', '30%', '45%', '60%'],
      wind: ['5%', '15%', '30%', '45%', '60%', '75%', '90%'],
      hail: ['5%', '15%', '30%', '45%', '60%'],
    },
  },
  2: {
    outlookTypes: ['tornado', 'wind', 'hail', 'categorical'],
    allowsProbabilities: true,
    allowedCIG: ['CIG1', 'CIG2', 'CIG3'],
    allowedCategorical: ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'],
    requiresConversion: true,
    probabilities: {
      tornado: ['2%', '5%', '10%', '15%', '30%', '45%', '60%'],
      wind: ['5%', '15%', '30%', '45%', '60%', '75%', '90%'],
      hail: ['5%', '15%', '30%', '45%', '60%'],
    },
  },
  3: {
    outlookTypes: ['totalSevere', 'categorical'],
    allowsProbabilities: true,
    allowedCIG: ['CIG1', 'CIG2'],
    allowedCategorical: ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT'],
    requiresConversion: true,
    probabilities: {
      totalSevere: ['5%', '15%', '30%', '45%', '60%'],
    },
  },
  4: {
    outlookTypes: ['day4-8'],
    allowsProbabilities: true,
    allowedCIG: [],
    allowedCategorical: [],
    requiresConversion: false,
    probabilities: { 'day4-8': ['15%', '30%'] },
  },
  5: {
    outlookTypes: ['day4-8'],
    allowsProbabilities: true,
    allowedCIG: [],
    allowedCategorical: [],
    requiresConversion: false,
    probabilities: { 'day4-8': ['15%', '30%'] },
  },
  6: {
    outlookTypes: ['day4-8'],
    allowsProbabilities: true,
    allowedCIG: [],
    allowedCategorical: [],
    requiresConversion: false,
    probabilities: { 'day4-8': ['15%', '30%'] },
  },
  7: {
    outlookTypes: ['day4-8'],
    allowsProbabilities: true,
    allowedCIG: [],
    allowedCategorical: [],
    requiresConversion: false,
    probabilities: { 'day4-8': ['15%', '30%'] },
  },
  8: {
    outlookTypes: ['day4-8'],
    allowsProbabilities: true,
    allowedCIG: [],
    allowedCategorical: [],
    requiresConversion: false,
    probabilities: { 'day4-8': ['15%', '30%'] },
  },
} as const;

const FALLBACK_CONSTRAINTS = {
  outlookTypes: [],
  allowsProbabilities: false,
  allowedCIG: [],
  allowedCategorical: [],
  requiresConversion: false,
  probabilities: {},
} as const;

/** Get constraints for a specific outlook day, including a safe runtime fallback. */
export function getOutlookConstraints(day: DayType | number): OutlookConstraints {
  return CONSTRAINTS_BY_DAY[day as DayType] ?? FALLBACK_CONSTRAINTS;
}
