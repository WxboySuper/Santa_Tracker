/**
 * Festive details shown beside the globe: how to say "Merry Christmas" in the main language of the country
 * Santa is over, and whether Christmas there mostly falls on 7 January. Kept deliberately small and well known;
 * countries not listed fall back to English. Fuller cultural notes come from sourced world-content cards.
 */
export interface Greeting {
  text: string;
  language: string;
}

const G = (text: string, language: string): Greeting => ({ text, language });
const SPANISH = G("¡Feliz Navidad!", "Spanish");
const PORTUGUESE = G("Feliz Natal", "Portuguese");
const FRENCH = G("Joyeux Noël", "French");
const GERMAN = G("Frohe Weihnachten", "German");
const ARABIC = G("عيد ميلاد مجيد", "Arabic");
const SWAHILI = G("Krismasi Njema", "Swahili");
const DUTCH = G("Vrolijk kerstfeest", "Dutch");
const CHINESE_TRADITIONAL = G("聖誕快樂", "Chinese");

const GREETINGS: Record<string, Greeting> = {
  // Asia and the Pacific
  JP: G("メリークリスマス", "Japanese"),
  KR: G("메리 크리스마스", "Korean"),
  CN: G("圣诞快乐", "Chinese"),
  TW: CHINESE_TRADITIONAL,
  HK: CHINESE_TRADITIONAL,
  MO: CHINESE_TRADITIONAL,
  PH: G("Maligayang Pasko", "Filipino"),
  ID: G("Selamat Natal", "Indonesian"),
  MY: G("Selamat Hari Krismas", "Malay"),
  VN: G("Chúc mừng Giáng sinh", "Vietnamese"),
  TH: G("สุขสันต์วันคริสต์มาส", "Thai"),
  NZ: G("Meri Kirihimete", "Māori"),
  WS: G("Manuia le Kerisimasi", "Samoan"),
  TO: G("Kilisimasi fiefia", "Tongan"),
  // Europe
  FR: FRENCH,
  MC: FRENCH,
  LU: FRENCH,
  DE: GERMAN,
  AT: GERMAN,
  LI: GERMAN,
  CH: GERMAN,
  ES: SPANISH,
  PT: PORTUGUESE,
  IT: G("Buon Natale", "Italian"),
  SM: G("Buon Natale", "Italian"),
  VA: G("Buon Natale", "Italian"),
  NL: DUTCH,
  BE: DUTCH,
  SE: G("God jul", "Swedish"),
  NO: G("God jul", "Norwegian"),
  DK: G("Glædelig jul", "Danish"),
  FI: G("Hyvää joulua", "Finnish"),
  IS: G("Gleðileg jól", "Icelandic"),
  IE: G("Nollaig Shona", "Irish"),
  PL: G("Wesołych Świąt", "Polish"),
  CZ: G("Veselé Vánoce", "Czech"),
  SK: G("Veselé Vianoce", "Slovak"),
  HU: G("Boldog karácsonyt", "Hungarian"),
  RO: G("Crăciun fericit", "Romanian"),
  GR: G("Καλά Χριστούγεννα", "Greek"),
  CY: G("Καλά Χριστούγεννα", "Greek"),
  HR: G("Sretan Božić", "Croatian"),
  RU: G("С Рождеством", "Russian"),
  UA: G("З Різдвом", "Ukrainian"),
  TR: G("Mutlu Noeller", "Turkish"),
  // Middle East and Africa
  EG: ARABIC,
  LB: ARABIC,
  JO: ARABIC,
  SY: ARABIC,
  IQ: ARABIC,
  MA: ARABIC,
  DZ: ARABIC,
  TN: ARABIC,
  IL: G("חג מולד שמח", "Hebrew"),
  KE: SWAHILI,
  TZ: SWAHILI,
  ET: G("መልካም ገና", "Amharic"),
  ZA: G("Geseënde Kersfees", "Afrikaans"),
  SN: FRENCH,
  CI: FRENCH,
  ML: FRENCH,
  CM: FRENCH,
  MG: FRENCH,
  // The Americas
  MX: SPANISH, GT: SPANISH, HN: SPANISH, SV: SPANISH, NI: SPANISH, CR: SPANISH, PA: SPANISH, CU: SPANISH, DO: SPANISH,
  CO: SPANISH, VE: SPANISH, EC: SPANISH, PE: SPANISH, BO: SPANISH, CL: SPANISH, AR: SPANISH, UY: SPANISH, PY: SPANISH,
  BR: PORTUGUESE,
  HT: G("Jwaye Nowèl", "Haitian Creole"),
  SR: DUTCH,
};

const ENGLISH = G("Merry Christmas", "English");

/**
 * Countries where most Christians keep Christmas on 7 January (the Julian calendar), so 24 December is an
 * ordinary night there for many people.
 */
const JANUARY_CHRISTMAS = new Set(["RU", "BY", "RS", "ME", "MK", "GE", "ET", "ER", "EG", "KZ", "MD"]);

export function greetingFor(countryCode: string | undefined): Greeting {
  return (countryCode && GREETINGS[countryCode.toUpperCase()]) || ENGLISH;
}

export function christmasInJanuary(countryCode: string | undefined): boolean {
  return Boolean(countryCode && JANUARY_CHRISTMAS.has(countryCode.toUpperCase()));
}

/** "Christmas Eve, 23:40" or "Christmas morning, 00:52" at the stop's local time. */
export function festiveMoment(localDayOfMonth: number, localHour: number): "eve" | "morning" | "day" {
  if (localDayOfMonth === 24) return "eve";
  return localHour < 6 ? "morning" : "day";
}
