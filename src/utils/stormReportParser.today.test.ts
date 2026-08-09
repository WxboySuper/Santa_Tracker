import { fetchYesterdayStormReports, parseTodayStormReportCsv } from './stormReportParser';

describe('parseTodayStormReportCsv', () => {
  test('parses tornado, wind, and hail sections from today.csv layout', () => {
    const csv = [
      'Time,F_Scale,Location,County,State,Lat,Lon,Comments',
      '1805,1,Ada,OK,OK,34.77,-96.67,Test tornado',
      'Time,Speed,Location,County,State,Lat,Lon,Comments',
      '1810,65,Norman,OK,OK,35.22,-97.44,Test wind',
      'Time,Size,Location,County,State,Lat,Lon,Comments',
      '1815,1.75,Moore,OK,OK,35.34,-97.49,Test hail',
    ].join('\n');

    const reports = parseTodayStormReportCsv(csv);

    expect(reports).toHaveLength(3);
    expect(reports.map((report) => report.type)).toEqual(['tornado', 'wind', 'hail']);
    expect(reports[0]?.magnitude).toBe('EF1');
    expect(reports[1]?.magnitude).toBe('65 mph');
    expect(reports[2]?.magnitude).toBe('1.75"');
  });

  test('collects sections in one input pass while preserving report type order', () => {
    const csv = [
      'Time,Size,Location,County,State,Lat,Lon,Comments',
      '1815,1.75,Moore,OK,OK,35.34,-97.49,Test hail',
      'Time,F_Scale,Location,County,State,Lat,Lon,Comments',
      '1805,1,Ada,OK,OK,34.77,-96.67,Test tornado',
      'Time,Speed,Location,County,State,Lat,Lon,Comments',
      '1810,65,Norman,OK,OK,35.22,-97.44,Test wind',
    ].join('\n');

    const reports = parseTodayStormReportCsv(csv);

    expect(reports.map((report) => report.type)).toEqual(['tornado', 'wind', 'hail']);
  });
});

describe('fetchYesterdayStormReports', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('fetches yesterday.csv and parses the combined report layout', async () => {
    const csv = [
      'Time,F_Scale,Location,County,State,Lat,Lon,Comments',
      'Time,Speed,Location,County,State,Lat,Lon,Comments',
      '1810,65,Norman,OK,OK,35.22,-97.44,Test wind',
      'Time,Size,Location,County,State,Lat,Lon,Comments',
      '1815,1.75,Moore,OK,OK,35.34,-97.49,Test hail',
    ].join('\n');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      text: () => Promise.resolve(csv),
    }) as unknown as typeof global.fetch;

    const reports = await fetchYesterdayStormReports();

    expect(global.fetch).toHaveBeenCalledWith('https://www.spc.noaa.gov/climo/reports/yesterday.csv');
    expect(reports).toHaveLength(2);
    expect(reports.map((report) => report.type)).toEqual(['wind', 'hail']);
    expect(reports[0]?.magnitude).toBe('65 mph');
    expect(reports[1]?.magnitude).toBe('1.75"');
  });
});
