import {
  CategoricalRiskLevel,
  ColorMappings,
  CIGLevel,
  TornadoProbability,
  WindProbability,
  HailProbability
} from '../types/outlooks';
export { getOutlookConstraints } from './outlookConstraints';

/**
 * Color mappings for all outlook types based on specifications in docs/product/outlook-info.md
 */
export const colorMappings: ColorMappings = {
  categorical: {
    'TSTM': '#C1E9C1', // General Thunderstorm (0/5)
    'MRGL': '#66A366', // Marginal (1/5) - Darker green
    'SLGT': '#FFE066', // Slight (2/5) - Golden yellow
    'ENH': '#FFA366',  // Enhanced (3/5) - Bright orange
    'MDT': '#E06666',  // Moderate (4/5) - Red
    'HIGH': '#EE99EE'  // High (5/5) - Magenta
  },
  tornado: {
    '2%': '#79BA7A',
    '5%': '#BD998A',
    '10%': '#FFE481',
    '15%': '#FF8080',
    '30%': '#FF80FF',
    '45%': '#C896F7',
    '60%': '#104E8B',
  },
  wind: {
    '5%': '#C5A392',
    '15%': '#FFEB7F',
    '30%': '#FF7F7F',
    '45%': '#FF7FFF',
    '60%': '#C895F6',
    '75%': '#5C85D6',
    '90%': '#1AFFFF',
  },
  hail: {
    '5%': '#C5A392',
    '15%': '#FFEB7F',
    '30%': '#FF7F7F',
    '45%': '#FF7FFF',
    '60%': '#C895F6',
  },
  totalSevere: {
    '5%': '#C5A392',
    '15%': '#FFEB7F',
    '30%': '#FF7F7F',
    '45%': '#FF7FFF',
    '60%': '#C895F6'
  },
  'day4-8': {
    '15%': '#FFFF00', // Yellow
    '30%': '#FF8C00'  // Orange
  },
  significant: '#000000', // Black hatch for significant threat areas
  hatching: {
    'CIG0': 'none',
    'CIG1': 'url(#pattern-cig1)',
    'CIG2': 'url(#pattern-cig2)',
    'CIG3': 'url(#pattern-cig3)'
  }
};

type CategoricalRule = {
  probabilities: readonly string[];
  cigs: readonly CIGLevel[];
  risk: CategoricalRiskLevel;
};

type CategoricalConversion = {
  probability: string;
  cig: CIGLevel;
  rules: readonly CategoricalRule[];
};

const categorizeProbability = ({ probability, cig, rules }: CategoricalConversion): CategoricalRiskLevel => {
  const normalizedProbability = probability.replace(/[#]/g, '%');
  return rules.find((rule) =>
    rule.probabilities.includes(normalizedProbability) && rule.cigs.includes(cig)
  )?.risk ?? 'TSTM';
};

type CategoricalInput = {
  probability: string;
  cig?: CIGLevel;
};

const CIG_01 = ['CIG0', 'CIG1'] as const;
const CIG_12 = ['CIG1', 'CIG2'] as const;
const CIG_23 = ['CIG2', 'CIG3'] as const;
const CIG_123 = ['CIG1', 'CIG2', 'CIG3'] as const;

const TORNADO_RULES: readonly CategoricalRule[] = [
  { probabilities: ['2%'], cigs: CIG_01, risk: 'MRGL' },
  { probabilities: ['2%'], cigs: ['CIG2'], risk: 'SLGT' },
  { probabilities: ['5%'], cigs: CIG_01, risk: 'SLGT' },
  { probabilities: ['10%'], cigs: ['CIG0'], risk: 'SLGT' },
  { probabilities: ['5%'], cigs: ['CIG2'], risk: 'ENH' },
  { probabilities: ['10%'], cigs: CIG_123, risk: 'ENH' },
  { probabilities: ['15%'], cigs: CIG_01, risk: 'ENH' },
  { probabilities: ['30%', '45%', '60%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['15%'], cigs: CIG_23, risk: 'MDT' },
  { probabilities: ['30%', '45%'], cigs: ['CIG1'], risk: 'MDT' },
  { probabilities: ['30%', '45%'], cigs: CIG_23, risk: 'HIGH' },
  { probabilities: ['60%'], cigs: CIG_123, risk: 'HIGH' },
];

const WIND_RULES: readonly CategoricalRule[] = [
  { probabilities: ['5%'], cigs: CIG_01, risk: 'MRGL' },
  { probabilities: ['5%'], cigs: ['CIG2'], risk: 'SLGT' },
  { probabilities: ['15%'], cigs: CIG_01, risk: 'SLGT' },
  { probabilities: ['30%'], cigs: ['CIG0'], risk: 'SLGT' },
  { probabilities: ['15%'], cigs: ['CIG2'], risk: 'ENH' },
  { probabilities: ['30%'], cigs: CIG_12, risk: 'ENH' },
  { probabilities: ['45%'], cigs: ['CIG1'], risk: 'ENH' },
  { probabilities: ['45%', '60%', '75%', '90%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['45%'], cigs: ['CIG2'], risk: 'MDT' },
  { probabilities: ['60%', '75%', '90%'], cigs: ['CIG1'], risk: 'MDT' },
  { probabilities: ['45%'], cigs: ['CIG3'], risk: 'HIGH' },
  { probabilities: ['60%', '75%', '90%'], cigs: CIG_23, risk: 'HIGH' },
];

const HAIL_RULES: readonly CategoricalRule[] = [
  { probabilities: ['5%'], cigs: CIG_01, risk: 'MRGL' },
  { probabilities: ['5%'], cigs: ['CIG2'], risk: 'SLGT' },
  { probabilities: ['15%'], cigs: CIG_01, risk: 'SLGT' },
  { probabilities: ['30%'], cigs: ['CIG0'], risk: 'SLGT' },
  { probabilities: ['15%'], cigs: ['CIG2'], risk: 'ENH' },
  { probabilities: ['30%'], cigs: CIG_12, risk: 'ENH' },
  { probabilities: ['45%'], cigs: CIG_01, risk: 'ENH' },
  { probabilities: ['60%'], cigs: ['CIG0'], risk: 'ENH' },
  { probabilities: ['45%'], cigs: ['CIG2'], risk: 'MDT' },
  { probabilities: ['60%'], cigs: CIG_12, risk: 'MDT' },
];

/** Convert tornado probability to categorical risk level. */
export function tornadoToCategorical({ probability, cig = 'CIG0' }: CategoricalInput): CategoricalRiskLevel {
  return categorizeProbability({ probability, cig, rules: TORNADO_RULES });
}

/** Convert wind probability to categorical risk level. */
export function windToCategorical({ probability, cig = 'CIG0' }: CategoricalInput): CategoricalRiskLevel {
  return categorizeProbability({ probability, cig, rules: WIND_RULES });
}

/** Convert hail probability to categorical risk level. */
export function hailToCategorical({ probability, cig = 'CIG0' }: CategoricalInput): CategoricalRiskLevel {
  return categorizeProbability({ probability, cig, rules: HAIL_RULES });
}

/** Convert Day 3 total severe probability to categorical risk level. */
export function totalSevereToCategorical({ probability, cig = 'CIG0' }: CategoricalInput): CategoricalRiskLevel {
  return categorizeProbability({ probability, cig, rules: HAIL_RULES });
}

/**
 * Determines if a probability string represents a significant threat
 * @param input The probability string to check
 * @returns True if it's a significant threat (contains #), false otherwise
 */
export function isSignificantThreat({ probability }: Pick<CategoricalInput, 'probability'>): boolean {
  return probability.includes('#');
}

/**
 * Get the highest categorical risk level from multiple probabilistic outlooks
 * @param probabilities Available tornado, wind, and hail probabilities
 * @returns The highest categorical risk level from the three probabilistic outlooks
 */
type AvailableProbabilities = {
  tornado?: TornadoProbability;
  wind?: WindProbability;
  hail?: HailProbability;
};

export function getHighestCategoricalRisk({
  tornado: tornadoProb,
  wind: windProb,
  hail: hailProb,
}: AvailableProbabilities = {}): CategoricalRiskLevel {
  const riskValues: { [key in CategoricalRiskLevel]: number } = {
    TSTM: 0,
    MRGL: 1,
    SLGT: 2,
    ENH: 3,
    MDT: 4,
    HIGH: 5
  };

  const candidates: CategoricalRiskLevel[] = [];
  if (tornadoProb) candidates.push(tornadoToCategorical({ probability: tornadoProb }));
  if (windProb) candidates.push(windToCategorical({ probability: windProb }));
  if (hailProb) candidates.push(hailToCategorical({ probability: hailProb }));

  if (candidates.length === 0) return 'TSTM';

  return candidates.reduce((best, current) => (
    riskValues[current] > riskValues[best] ? current : best
  ), candidates[0]);
}

/**
 * Gets the display name for a categorical risk level
 * @param risk The categorical risk level
 * @returns The display name with numerical rating
 */
export function getCategoricalRiskDisplayName(risk: CategoricalRiskLevel): string {
  switch (risk) {
    case 'TSTM':
      return 'General Thunder (0/5)';
    case 'MRGL':
      return 'Marginal Risk (1/5)';
    case 'SLGT':
      return 'Slight Risk (2/5)';
    case 'ENH':
      return 'Enhanced Risk (3/5)';
    case 'MDT':
      return 'Moderate Risk (4/5)';
    case 'HIGH':
      return 'High Risk (5/5)';
    default:
      return 'Unknown';
  }
}

/**
 * Gets the color for an outlook type and probability/risk level
 * @param input The outlook type and probability or risk level
 * @returns The hex color code
 */
type OutlookColorInput = {
  outlookType: string;
  probability: string;
};

export function getOutlookColor({ outlookType, probability }: OutlookColorInput): string {
  if (outlookType in colorMappings) {
    const typeColors = colorMappings[outlookType as keyof typeof colorMappings];
    if (typeof typeColors === 'object' && probability in typeColors) {
      return typeColors[probability as keyof typeof typeColors] || '#808080';
    }
  }
  return '#808080'; // Default gray
}
