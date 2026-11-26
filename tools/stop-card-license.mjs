/**
 * Map a Commons LicenseShortName to one of the licenses we may publish. Anything with a NonCommercial or
 * NoDerivatives term, or any license we do not recognise exactly, returns null and the photo is dropped.
 */
export function permissiveLicense(license) {
  const name = String(license ?? '').trim();
  if (/\b(NC|ND)\b|non-?commercial|no-?deriv/i.test(name)) return null;
  if (/^CC0(?:\s|$)/i.test(name)) return 'CC0';
  if (/^public domain$/i.test(name) || /^PD(?:[- ]|$)/.test(name)) return 'Public domain';
  if (/^CC BY-SA(?:\s+\d(?:\.\d)?)?(?:\s+[a-z-]+)?$/i.test(name)) return 'CC BY-SA';
  if (/^CC BY(?:\s+\d(?:\.\d)?)?(?:\s+[a-z-]+)?$/i.test(name)) return 'CC BY';
  return null;
}
