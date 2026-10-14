import { ActivitySaveMigrationError } from './save-errors';

const ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

// ISO offsets range from -12:00 through +14:00, with minute values below 60.
const ISO_OFFSET_PATTERN = /^(?:[+](?:0\d|1[0-3]):?[0-5]\d|[+]14:?00|-(?:0\d|1[01]):?[0-5]\d|-12:?00)$/;

function parseIsoOffsetMinutes(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (value === 'Z') return 0;
  if (!ISO_OFFSET_PATTERN.test(value)) return undefined;
  const compact = value.replace(':', '');
  const sign = compact.startsWith('-') ? -1 : 1;
  return sign * (Number(compact.slice(1, 3)) * 60 + Number(compact.slice(3, 5)));
}

function matchesIsoLocalTime(value: string, offsetMinutes: number): boolean {
  // Date.parse can normalize invalid dates, so compare its result to the input
  // wall clock after adjusting the parsed instant back to its local offset.
  const normalized = value
    .replace(/\.\d+(?=Z|[+-]\d{2}:?\d{2}$)/, '')
    .replace(/([+-]\d{2}):?(\d{2})$/, '$1:$2');
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return false;
  const localTimestamp = new Date(timestamp + offsetMinutes * 60_000);
  return localTimestamp.toISOString().startsWith(value.slice(0, 19));
}

function isValidIsoDateTime(value: unknown): boolean {
  return typeof value === 'string' && isValidIsoDateTimeString(value);
}

function isValidIsoDateTimeString(value: string): boolean {
  const match = ISO_DATE_TIME_PATTERN.exec(value);
  if (match === null) return false;
  const offsetMinutes = parseIsoOffsetMinutes(match[7]);
  return offsetMinutes !== undefined && matchesIsoLocalTime(value, offsetMinutes);
}

export function assertIsoTimestamp(value: unknown): void {
  if (!isValidIsoDateTime(value)) {
    throw new ActivitySaveMigrationError('Save timestamp must be a valid ISO date');
  }
}
