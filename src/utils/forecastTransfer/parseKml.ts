import type { DayType } from '../../types/outlooks';
import type { ParsedKmlPlacemark } from './types';
import {
  findKmlElementsByLocalName,
  inferKmlFolderContext,
} from './parseKmlPlacemarkHelpers';
import { parseKmlPlacemark } from './parseKmlPlacemark';

/** Parses a KML document into GFC placemark records and import warnings. */
export const parseKmlDocument = (
  kml: string,
  defaultDay: DayType = 1,
): { placemarks: ParsedKmlPlacemark[]; warnings: string[] } => {
  const warnings: string[] = [];
  const parser = new DOMParser();
  const document = parser.parseFromString(kml, 'application/xml');
  const parserError = document.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('File is not valid KML.');
  }

  const placemarks: ParsedKmlPlacemark[] = [];
  const placemarkNodes = findKmlElementsByLocalName(document, 'placemark');
  placemarkNodes.forEach((placemark) => {
    const parsed = parseKmlPlacemark(
      placemark,
      inferKmlFolderContext(placemark, defaultDay),
      warnings,
    );
    if (parsed) {
      placemarks.push(parsed);
    }
  });

  if (placemarks.length === 0) {
    throw new Error('No supported outlook polygons were found in the KML file.');
  }
  return { placemarks, warnings };
};

export { forecastCycleFromKmlPlacemarks } from './forecastCycleFromKml';
