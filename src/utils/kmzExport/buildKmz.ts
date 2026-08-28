import JSZip from 'jszip';
import { buildStructuredKmlDocument } from './buildKml';
import { collectKmzExportFeatures, getOutlookLabel, groupFeaturesByDay, groupFeaturesByOutlook } from './collectFeatures';
import { escapeXml } from './color';
import type { KmzExportInput } from './types';

const LIMITATIONS_TEXT = `GFC KMZ export limitations
==========================

- CIG hatch patterns (CIG1/CIG2/CIG3) export as lightly filled polygons with metadata only.
- Significant (#) contours keep fill color but do not export the black hatch overlay.
- Custom product layers are excluded unless explicitly enabled in export options.
- Text labels, legend badges, and map overlays are not exported.
- Opacity follows per-outlook settings when present; otherwise a default fill opacity is used.
- Consumers that ignore ExtendedData may not show significance/CIG metadata.
`;

/** Builds a KMZ archive with one KML file per day/outlook combination plus a root index. */
export const buildSplitKmzArchive = async (input: KmzExportInput): Promise<Blob> => {
  const zip = new JSZip();
  const features = collectKmzExportFeatures(input);
  const groupedByDay = groupFeaturesByDay(features);

  zip.file('README-limitations.txt', LIMITATIONS_TEXT);

  const networkLinks: string[] = [];

  groupedByDay.forEach((dayFeatures, day) => {
    const groupedByOutlook = groupFeaturesByOutlook(dayFeatures);

    groupedByOutlook.forEach((outlookFeatures, outlookType) => {
      const relativePath = `days/day-${day}/${outlookType}.kml`;
      const scopedInput: KmzExportInput = {
        forecastCycle: {
          ...input.forecastCycle,
          days: {
            [day]: input.forecastCycle.days[day]!,
          },
          currentDay: day,
        },
        options: {
          ...input.options,
          scope: 'current-day',
          day,
          outlookTypes: [outlookType],
        },
      };

      zip.file(relativePath, buildStructuredKmlDocument(scopedInput));
      networkLinks.push(`<NetworkLink>
  <name>${escapeXml(`Day ${day} ${getOutlookLabel(outlookType)}`)}</name>
  <Link><href>${escapeXml(relativePath)}</href></Link>
</NetworkLink>`);
    });
  });

  const rootKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>GFC Forecast KMZ</name>
    <description>${escapeXml(`Cycle date ${input.forecastCycle.cycleDate}. Open child layers per day/outlook.`)}</description>
    ${networkLinks.join('')}
  </Document>
</kml>`;

  zip.file('doc.kml', rootKml);

  return zip.generateAsync({ type: 'blob' });
};

/** Builds a KMZ archive containing a single structured KML document. */
export const buildStructuredKmzArchive = async (input: KmzExportInput): Promise<Blob> => {
  const zip = new JSZip();
  zip.file('doc.kml', buildStructuredKmlDocument(input));
  zip.file('README-limitations.txt', LIMITATIONS_TEXT);
  return zip.generateAsync({ type: 'blob' });
};
