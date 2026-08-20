import { bbox, booleanPointInPolygon, feature as turfFeature, point } from '@turf/turf';
import type { Feature, Polygon, MultiPolygon, Geometry } from 'geojson';
import { StormReport, ReportType } from '../types/stormReports';
import { OutlookData } from '../types/outlooks';
import type { GeoJsonProperties } from 'geojson';

export interface OutlookTypeVerification {
  hits: number;
  misses: number;
  hitRate: number;
  byRiskLevel: {
    [riskLevel: string]: {
      hits: number;
      misses: number;
      hitRate: number;
      total: number; // Total relevant reports for calculating display fraction
    };
  };
  reportDetails: {
    report: StormReport;
    hit: boolean;
    riskLevel?: string;
  }[];
}

export interface VerificationResult {
  totalReports: number;
  reportsByType: {
    tornado: number;
    wind: number;
    hail: number;
  };
  categorical: OutlookTypeVerification;
  tornado: OutlookTypeVerification;
  wind: OutlookTypeVerification;
  hail: OutlookTypeVerification;
}

/**
 * Analyzes storm reports against a specific outlook type
 */
function analyzeOutlookType(
  reports: StormReport[],
  outlookMap: Map<string, Feature<Geometry, GeoJsonProperties>[]> | undefined,
  relevantReportTypes: ReportType[]
): OutlookTypeVerification {
  const result: OutlookTypeVerification = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    byRiskLevel: {},
    reportDetails: []
  };

  // Filter reports to only those relevant for this outlook type
  const relevantReports = reports.filter(r => relevantReportTypes.includes(r.type));
  const totalRelevantReports = relevantReports.length;

  // Pre-process outlook polygons outside the loop
  const processedPolygons: {
    riskLevel: string;
    polygon: Feature<Polygon | MultiPolygon>;
    bounds: [number, number, number, number];
  }[] = [];
  if (outlookMap) {
    for (const [riskLevel, features] of outlookMap.entries()) {
      for (const feature of features) {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          try {
            processedPolygons.push({
              riskLevel,
              polygon: turfFeature(feature.geometry) as Feature<Polygon | MultiPolygon>,
              bounds: bbox(feature) as [number, number, number, number],
            });
          } catch {
            // Skip malformed polygon features
          }
        }
      }
    }
  }

  for (const report of relevantReports) {
    const reportPointCoords: [number, number] = [report.longitude, report.latitude];
    let hit = false;
    let highestRiskLevel: string | undefined;

    if (processedPolygons.length > 0) {
      const riskLevelsContainingReport = new Set<string>();
      
      // Find all risk levels that contain this report
      for (const { riskLevel, polygon, bounds } of processedPolygons) {
        if (!riskLevelsContainingReport.has(riskLevel)) {
          const [minX, minY, maxX, maxY] = bounds;
          if (reportPointCoords[0] < minX || reportPointCoords[0] > maxX
            || reportPointCoords[1] < minY || reportPointCoords[1] > maxY) {
            continue;
          }
          if (booleanPointInPolygon(point(reportPointCoords), polygon)) {
            riskLevelsContainingReport.add(riskLevel);
          }
        }
      }

      // If report is in any risk area, it's a hit
      if (riskLevelsContainingReport.size > 0) {
        hit = true;
        
        // Find the highest risk level
        highestRiskLevel = Array.from(riskLevelsContainingReport).reduce((highest, current) => {
          if (!highest) return current;
          return compareRiskLevels(current, highest) > 0 ? current : highest;
        }, undefined as string | undefined);
      }
    }

    result.reportDetails.push({
      report,
      hit,
      riskLevel: highestRiskLevel
    });

    if (hit) {
      result.hits++;
      
      // Only count this report for the HIGHEST risk level it falls into
      if (highestRiskLevel) {
        if (!result.byRiskLevel[highestRiskLevel]) {
          result.byRiskLevel[highestRiskLevel] = { hits: 0, misses: 0, hitRate: 0, total: totalRelevantReports };
        }
        result.byRiskLevel[highestRiskLevel].hits++;
      }
    } else {
      result.misses++;
    }
  }

  // Calculate hit rates
  if (totalRelevantReports > 0) {
    result.hitRate = (result.hits / totalRelevantReports) * 100;
  }

  // Calculate hit rates by risk level as percentage of TOTAL reports
  Object.keys(result.byRiskLevel).forEach(level => {
    const levelData = result.byRiskLevel[level];
    levelData.total = totalRelevantReports; // Ensure total is set
    if (totalRelevantReports > 0) {
      // Hit rate = (reports in this level) / (total relevant reports) * 100
      levelData.hitRate = (levelData.hits / totalRelevantReports) * 100;
    }
  });

  return result;
}

/**
 * Compares two risk levels and returns which is higher
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareRiskLevels(a: string, b: string): number {
  const order = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH', '2%', '5%', '10%', '15%', '30%', '45%', '60%', 'SIG'];
  const indexA = order.indexOf(a.toUpperCase());
  const indexB = order.indexOf(b.toUpperCase());
  
  if (indexA === -1 && indexB === -1) return 0;
  if (indexA === -1) return -1;
  if (indexB === -1) return 1;
  
  return indexA - indexB;
}

/**
 * Analyzes storm reports against forecast outlooks to provide verification metrics
 * @param reports Array of storm reports
 * @param outlooks Current outlook data from forecast
 * @returns Verification results with hit/miss analysis by outlook type
 */
export function analyzeVerification(
  reports: StormReport[],
  outlooks: OutlookData
): VerificationResult {
  const result: VerificationResult = {
    totalReports: reports.length,
    reportsByType: {
      tornado: reports.filter(r => r.type === 'tornado').length,
      wind: reports.filter(r => r.type === 'wind').length,
      hail: reports.filter(r => r.type === 'hail').length
    },
    categorical: analyzeOutlookType(reports, outlooks.categorical, ['tornado', 'wind', 'hail']),
    tornado: analyzeOutlookType(reports, outlooks.tornado, ['tornado']),
    wind: analyzeOutlookType(reports, outlooks.wind, ['wind']),
    hail: analyzeOutlookType(reports, outlooks.hail, ['hail'])
  };

  return result;
}

/**
 * Calculates POD (Probability of Detection)
 * POD = hits / (hits + misses)
 */
export function calculatePOD(hits: number, misses: number): number {
  const total = hits + misses;
  return total > 0 ? (hits / total) * 100 : 0;
}

/**
 * Generates a summary text for verification results for a specific outlook type
 */
export function formatOutlookVerificationSummary(
  outlookType: string,
  verification: OutlookTypeVerification
): string {
  const { hits, misses, hitRate, byRiskLevel } = verification;
  const total = hits + misses;
  
  let summary = `
${outlookType.toUpperCase()} Verification:
- Total Relevant Reports: ${total}
- Hits: ${hits} (${hitRate.toFixed(1)}%)
- Misses: ${misses} (${(100 - hitRate).toFixed(1)}%)
`;

  if (Object.keys(byRiskLevel).length > 0) {
    summary += '\nBy Risk Level:\n';
    Object.entries(byRiskLevel)
      .sort((a, b) => compareRiskLevels(b[0], a[0])) // Sort highest to lowest
      .forEach(([level, data]) => {
        summary += `  ${level}: ${data.hits} hits (${data.hitRate.toFixed(1)}%)\n`;
      });
  }
  
  return summary.trim();
}

/**
 * Generates a summary text for verification results
 */
export function formatVerificationSummary(result: VerificationResult, outlookType: 'categorical' | 'tornado' | 'wind' | 'hail' = 'categorical'): string {
  const { totalReports, reportsByType } = result;
  const verification = result[outlookType];
  
  return `
Verification Summary:
- Total Reports: ${totalReports}
  - Tornado: ${reportsByType.tornado}
  - Wind: ${reportsByType.wind}
  - Hail: ${reportsByType.hail}

${formatOutlookVerificationSummary(outlookType, verification)}

Note: A "hit" means the report falls within the forecast outlook area at any risk level.
A "miss" means the report occurred outside the forecast area.
  `.trim();
}
