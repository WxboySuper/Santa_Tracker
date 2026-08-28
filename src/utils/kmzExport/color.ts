/** Converts #RRGGBB to KML aabbggrr color (alpha defaults to ~66% fill). */
export const hexToKmlColor = (hex: string, alpha = 0.66): string => {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return 'aaffffff';
  }

  const red = normalized.slice(0, 2);
  const green = normalized.slice(2, 4);
  const blue = normalized.slice(4, 6);
  const alphaByte = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');

  return `${alphaByte}${blue}${green}${red}`.toLowerCase();
};

/** Escapes text for safe inclusion in KML/XML payloads. */
export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
