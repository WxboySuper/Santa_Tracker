import { OutlookType, CategoricalRiskLevel, TornadoProbability, WindProbability, HailProbability, TotalSevereProbability, Day48Probability, CIGLevel, DayType } from '../../types/outlooks';
import { colorMappings, getOutlookConstraints } from '../../utils/outlookUtils';

/**
 * Get available probability options for a given outlook type and day.
 * Returns a typed array of probabilities or CIG hatching options depending on outlook.
 */
export const getAvailableProbabilities = (activeOutlookType: OutlookType, currentDay: DayType = 1) => {
  const constraints = getOutlookConstraints(currentDay);
  const cigs = constraints.allowedCIG as readonly CIGLevel[]; // Available hatching options based on day
  const probabilities = constraints.probabilities as Partial<Record<OutlookType, readonly string[]>>;
  
  switch (activeOutlookType) {
    case 'categorical':
      // If conversion is required (Day 1-3), only TSTM is manually drawn.
      // If manual drawing is allowed (Day 4-8), return empty (no categorical for Day 4-8).
      if (constraints.requiresConversion) {
        return ['TSTM'] as CategoricalRiskLevel[];
      } else {
        // Day 4-8 doesn't have categorical
        return [];
      }
    case 'tornado':
      // Day 1/2 only
      if (probabilities.tornado) {
        return [...probabilities.tornado, ...cigs] as (TornadoProbability | CIGLevel)[];
      }
      return [];
    case 'wind':
      // Day 1/2 only
      if (probabilities.wind) {
        return [...probabilities.wind, ...cigs] as (WindProbability | CIGLevel)[];
      }
      return [];
    case 'hail':
      // Day 1/2 only; CIG3 (crosshatch) is not a valid hail hatching style
      if (probabilities.hail) {
        const hailCigs = cigs.filter(c => c !== 'CIG3');
        return [...probabilities.hail, ...hailCigs] as (HailProbability | CIGLevel)[];
      }
      return [];
    case 'totalSevere':
      // Day 3 only
      if (probabilities.totalSevere) {
        return [...probabilities.totalSevere, ...cigs] as (TotalSevereProbability | CIGLevel)[];
      }
      return [];
    case 'day4-8':
      // Day 4-8 only (no CIG)
      if (probabilities['day4-8']) {
        return probabilities['day4-8'] as Day48Probability[];
      }
      return [];
    default:
      return [] as string[];
  }
};

/**
 * Legacy significance checker. Always returns false to preserve API shape.
 */
export const canBeSignificant = (
  _activeOutlookType: OutlookType,
  _activeProbability: string,
  _significantThreatsEnabled: boolean
): boolean => {
  return false;
};

/**
 * Returns inline style for a probability button given the active outlook type and selected probability.
 */
export const getProbabilityButtonStyle = (activeOutlookType: OutlookType, activeProbability: string, prob: string) => {
  const isActive = activeProbability === prob;
  let color: string;
  let textColor: string;

  if (activeOutlookType === 'categorical') {
    color = colorMappings.categorical[prob as keyof typeof colorMappings.categorical] || '#FFFFFF';
    if (['TSTM', 'MRGL', 'SLGT'].includes(prob)) {
      textColor = '#000000';
    } else {
      textColor = '#FFFFFF';
    }
  } else if (prob.startsWith('CIG')) {
     // Hatching buttons
     color = '#e0e0e0';
     textColor = '#000000';
  } else {
    // Determine color map
    let colorMap: Record<string, string>;
    if (activeOutlookType === 'tornado') colorMap = colorMappings.tornado;
    else if (activeOutlookType === 'wind') colorMap = colorMappings.wind;
    else if (activeOutlookType === 'hail') colorMap = colorMappings.hail;
    else if (activeOutlookType === 'totalSevere') colorMap = colorMappings.totalSevere;
    else if (activeOutlookType === 'day4-8') colorMap = colorMappings['day4-8'];
    else colorMap = {};

    color = colorMap[prob as keyof typeof colorMap] || '#FFFFFF';
    
    // Yellow (15% for day4-8) gets black text
    if (activeOutlookType === 'day4-8' && prob === '15%') {
      textColor = '#000000';
    } else {
      textColor = '#FFFFFF';
    }
  }

  return {
    backgroundColor: color,
    color: textColor,
    boxShadow: isActive ? '0 0 0 2px white, 0 0 0 4px #3f51b5' : undefined
  };
};

/**
 * Returns the preview color for the currently selected outlook/probability.
 */
export const getCurrentColor = (activeOutlookType: OutlookType, activeProbability: string) => {
  if (activeOutlookType === 'categorical') {
    return colorMappings.categorical[activeProbability as keyof typeof colorMappings.categorical] || '#FFFFFF';
  }
  if (activeProbability.startsWith('CIG')) {
      return '#e0e0e0'; // Placeholder for color preview
  }
  
  let colorMap: Record<string, string>;
  if (activeOutlookType === 'tornado') colorMap = colorMappings.tornado;
  else if (activeOutlookType === 'wind') colorMap = colorMappings.wind;
  else if (activeOutlookType === 'hail') colorMap = colorMappings.hail;
  else if (activeOutlookType === 'totalSevere') colorMap = colorMappings.totalSevere;
  else if (activeOutlookType === 'day4-8') colorMap = colorMappings['day4-8'];
  else colorMap = {};
  
  return colorMap[activeProbability as keyof typeof colorMap] || '#FFFFFF';
};