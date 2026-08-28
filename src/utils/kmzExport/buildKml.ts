import { escapeXml, hexToKmlColor } from './color';
import { geometryToKml } from './geometry';
import { collectKmzExportFeatures, getOutlookLabel, groupFeaturesByDay, groupFeaturesByOutlook } from './collectFeatures';
import type { KmzExportFeature, KmzExportInput } from './types';

const buildExtendedData = (feature: KmzExportFeature): string => {
  const entries = [
    ['gfc_day', String(feature.day)],
    ['gfc_outlook_type', feature.outlookType],
    ['gfc_probability_key', feature.probabilityKey],
    ['gfc_significant', feature.isSignificant ? 'true' : 'false'],
    ['gfc_cig', feature.isCig ? feature.cigLevel ?? 'true' : 'false'],
    ['gfc_fill_color', feature.fillColor],
  ];

  const data = entries
    .map(([name, value]) => `<Data name="${escapeXml(name)}"><value>${escapeXml(value)}</value></Data>`)
    .join('');

  return `<ExtendedData>${data}</ExtendedData>`;
};

const buildPlacemark = (feature: KmzExportFeature): string => {
  const geometry = geometryToKml(feature.feature.geometry);
  if (!geometry) {
    return '';
  }

  const name = `${getOutlookLabel(feature.outlookType)} ${feature.probabilityKey}`;
  const description = feature.isCig
    ? 'CIG hatch overlay exported without pattern fill. See gfc_cig ExtendedData.'
    : feature.isSignificant
      ? 'Significant threat contour. Hatch pattern is not exported; border width is increased.'
      : 'GFC outlook polygon';

  return `<Placemark>
  <name>${escapeXml(name)}</name>
  <description>${escapeXml(description)}</description>
  ${buildExtendedData(feature)}
  <Style>
    <LineStyle>
      <color>${hexToKmlColor(feature.strokeColor, 1)}</color>
      <width>${feature.strokeWidth}</width>
    </LineStyle>
    <PolyStyle>
      <color>${hexToKmlColor(feature.fillColor, feature.fillOpacity)}</color>
      <fill>1</fill>
      <outline>1</outline>
    </PolyStyle>
  </Style>
  ${geometry}
</Placemark>`;
};

const buildFolder = (name: string, children: string): string => {
  if (!children.trim()) {
    return '';
  }

  return `<Folder><name>${escapeXml(name)}</name>${children}</Folder>`;
};

/** Builds one structured KML document with Day > Outlook folders. */
export const buildStructuredKmlDocument = (input: KmzExportInput): string => {
  const features = collectKmzExportFeatures(input);
  const groupedByDay = groupFeaturesByDay(features);
  const dayFolders = Array.from(groupedByDay.entries())
    .sort(([dayA], [dayB]) => dayA - dayB)
    .map(([day, dayFeatures]) => {
      const groupedByOutlook = groupFeaturesByOutlook(dayFeatures);
      const outlookFolders = Array.from(groupedByOutlook.entries())
        .map(([outlookType, outlookFeatures]) => {
          const placemarks = outlookFeatures.map(buildPlacemark).join('');
          return buildFolder(getOutlookLabel(outlookType), placemarks);
        })
        .join('');

      return buildFolder(`Day ${day}`, outlookFolders);
    })
    .join('');

  const cycleDate = input.forecastCycle.cycleDate;
  const scopeLabel = input.options.scope === 'cycle' ? 'Full forecast cycle' : `Day ${input.options.day ?? input.forecastCycle.currentDay}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>GFC Forecast Export</name>
    <description>${escapeXml(`Exported from Graphical Forecast Creator on ${cycleDate}. Scope: ${scopeLabel}.`)}</description>
    ${dayFolders}
  </Document>
</kml>`;
};
