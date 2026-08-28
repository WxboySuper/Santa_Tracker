import type { ForecastTransferFormat } from './types';

const KML_EXTENSIONS = new Set(['.kml', '.kmz']);
const JSON_EXTENSIONS = new Set(['.json', '.gfc']);
const PACKAGE_EXTENSIONS = new Set(['.zip']);

const hasExtension = (name: string, extensions: Set<string>): boolean =>
  [...extensions].some((ext) => name.endsWith(ext));

const detectByName = (lowerName: string): ForecastTransferFormat | null => {
  if (hasExtension(lowerName, KML_EXTENSIONS)) return lowerName.endsWith('.kmz') ? 'kmz' : 'kml';
  if (hasExtension(lowerName, JSON_EXTENSIONS)) return 'json';
  if (hasExtension(lowerName, PACKAGE_EXTENSIONS)) return 'package';
  return null;
};

const detectByMime = (file: File): ForecastTransferFormat | null => {
  if (file.type === 'application/vnd.google-earth.kml+xml') return 'kml';
  if (file.type === 'application/vnd.google-earth.kmz') return 'kmz';
  if (file.type === 'application/zip') return 'package';
  return null;
};

const hasZipSignature = (bytes?: Uint8Array): boolean => bytes?.[0] === 0x50 && bytes?.[1] === 0x4b;

/** Detects the forecast transfer format from file metadata. */
export const detectForecastTransferFormat = (file: File, bytes?: Uint8Array): ForecastTransferFormat | null => {
  const lowerName = file.name.toLowerCase();
  // Prefer explicit KML/KMZ metadata before the generic ZIP signature: KMZ is a ZIP container.
  return detectByName(lowerName) ?? detectByMime(file) ?? (hasZipSignature(bytes) ? 'package' : null);
};
