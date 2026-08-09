import { buildCsvRow, extractStormReportMagnitude, splitCsvLine } from './stormReportCsv';

describe('stormReportCsv', () => {
  test('splitCsvLine respects quoted commas', () => {
    expect(splitCsvLine('"a,b",c')).toEqual(['a,b', 'c']);
  });

  test('splitCsvLine preserves long fields while accumulating characters', () => {
    const longField = 'weather '.repeat(1000);
    expect(splitCsvLine(`"${longField}",ok`)).toEqual([longField, 'ok']);
  });

  test('extractStormReportMagnitude parses tornado EF scale', () => {
    const row = buildCsvRow(['EF_Scale', 'Comments'], ['2', '']);
    expect(extractStormReportMagnitude('tornado', row, {
      scaleField: 'EF_Scale',
      latField: 'Lat',
      lonField: 'Lon',
      remarksField: 'Comments',
    })).toBe('EF2');
  });
});
