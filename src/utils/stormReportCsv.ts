import type { ReportType } from '../types/stormReports';

export interface StormReportRowFieldMap {
  scaleField?: string;
  speedField?: string;
  sizeField?: string;
  latField: string;
  lonField: string;
  remarksField: string;
}

export const splitCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let currentValue: string[] = [];
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue.join(''));
      currentValue = [];
    } else {
      currentValue.push(char);
    }
  }

  values.push(currentValue.join(''));
  return values;
};

export const buildCsvRow = (headers: string[], values: string[]): Record<string, string> => {
  const row: Record<string, string> = {};
  for (const [index, header] of headers.entries()) {
    row[header] = values[index] || '';
  }
  return row;
};

const extractTornadoMagnitude = (row: Record<string, string>, fields: StormReportRowFieldMap): string => {
  const remarks = row[fields.remarksField] || '';
  const scaleField = fields.scaleField ? row[fields.scaleField] : '';
  if (scaleField && scaleField !== 'UNK') {
    return scaleField.startsWith('EF') ? scaleField : `EF${scaleField}`;
  }

  const efMatch = remarks.match(/EF-?(\d+)/i);
  return efMatch ? `EF${efMatch[1]}` : '';
};

const extractWindMagnitude = (row: Record<string, string>, fields: StormReportRowFieldMap): string => {
  const speed = fields.speedField ? row[fields.speedField] : '';
  if (speed && speed !== 'UNK') {
    return speed.toLowerCase().includes('mph') ? speed : `${speed} mph`;
  }
  return '';
};

const extractHailMagnitude = (row: Record<string, string>, fields: StormReportRowFieldMap): string => {
  const size = fields.sizeField ? row[fields.sizeField] : '';
  if (!size || size === 'UNK') {
    return '';
  }

  if (size.includes('.')) {
    return `${size}"`;
  }

  const inches = parseInt(size, 10) / 100;
  return Number.isNaN(inches) ? '' : `${inches.toFixed(2)}"`;
};

export const extractStormReportMagnitude = (
  type: ReportType,
  row: Record<string, string>,
  fields: StormReportRowFieldMap,
): string => {
  if (type === 'tornado') {
    return extractTornadoMagnitude(row, fields);
  }

  if (type === 'wind') {
    return extractWindMagnitude(row, fields);
  }

  return extractHailMagnitude(row, fields);
};
