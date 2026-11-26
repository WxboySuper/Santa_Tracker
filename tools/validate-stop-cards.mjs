import { writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

/** Report a fatal problem and stop. The write is synchronous so the message is never cut off by the exit. */
function fail(message) {
  writeSync(2, `Stop card validation failed:\n- ${message}\n`);
  process.exit(1);
}

const dataPath = process.argv[2] ?? new URL('../content/stop-cards.json', import.meta.url);
let cards;
try {
  cards = JSON.parse(await readFile(dataPath, 'utf8'));
} catch (error) {
  fail(`could not load ${String(dataPath)}: ${error.message}`);
}
const cardKeys = new Set(['place_id', 'country', 'note', 'sources', 'topic_key', 'photo', 'review_status', 'allow_duplicate_topic']);
const photoKeys = new Set(['url', 'width', 'height', 'author', 'license', 'license_url', 'source_page']);
const extraKeys = (value, allowed) => Object.keys(value).filter((key) => !allowed.has(key));
/** An absolute https:// URL with a host, as the schema's format: uri plus ^https:// requires. */
function isHttpsUrl(value) {
  // No surrounding or embedded whitespace: new URL() would quietly trim it, but the schema pattern rejects it.
  if (typeof value !== 'string' || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}
const errors = [];
const allowedLicenses = new Set(['CC0', 'Public domain', 'CC BY', 'CC BY-SA']);
const normalized = (value) => value.toLocaleLowerCase('en').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function similarity(left, right) {
  const grams = (text) => { const words = normalized(text).split(' ').filter(Boolean); return new Set(Array.from({ length: Math.max(0, words.length - 2) }, (_, i) => words.slice(i, i + 3).join(' '))); };
  const a = grams(left); const b = grams(right);
  if (!a.size || !b.size) return normalized(left) === normalized(right) ? 1 : 0;
  let shared = 0; for (const gram of a) if (b.has(gram)) shared++;
  return shared / (a.size + b.size - shared);
}
if (!Array.isArray(cards)) {
  fail('stop cards must be a JSON array');
}
const placeIds = new Set(); const topics = new Map();
for (const [index, card] of cards.entries()) {
  const prefix = 'cards[' + index + ']';
  if (!card || typeof card !== 'object' || typeof card.place_id !== 'string' || !card.place_id.trim()) { errors.push(prefix + ': place_id is required'); continue; }
  // IDs and countries must not carry padding, which would let ' Q1 ' slip past the duplicate checks.
  if (card.place_id !== card.place_id.trim()) errors.push(prefix + ': place_id must not have leading or trailing spaces');
  if (typeof card.country === 'string' && card.country !== card.country.trim()) errors.push(prefix + ': country must not have leading or trailing spaces');
  const placeKey = card.place_id.trim();
  if (placeIds.has(placeKey)) errors.push(prefix + ': duplicate place_id ' + placeKey); else placeIds.add(placeKey);
  if (typeof card.country !== 'string' || !card.country.trim()) errors.push(prefix + ': country is required');
  if (!Array.isArray(card.sources) || card.sources.length === 0 || card.sources.some((source) => !isHttpsUrl(source))) errors.push(prefix + ': at least one HTTPS source URL is required');
  if (card.note !== null && (typeof card.note !== 'string' || card.note.length < 40 || card.note.length > 280)) errors.push(prefix + ': note must be null or 40 to 280 characters');
  if (card.topic_key !== null && (typeof card.topic_key !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(card.topic_key))) errors.push(prefix + ': topic_key must use lowercase letters, digits, dots, dashes, or underscores');
  if (card.note !== null && (typeof card.topic_key !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(card.topic_key))) errors.push(prefix + ': a note requires a valid topic_key');
  if (typeof card.note === 'string') {
    for (let prior = 0; prior < index; prior++) if (typeof cards[prior]?.note === 'string' && similarity(card.note, cards[prior].note) >= 0.72) errors.push(prefix + ': note duplicates or closely matches cards[' + prior + ']');
  }
  // Topic keys are unique per country whether or not the note is written yet. The first holder of a key keeps it.
  for (const key of extraKeys(card, cardKeys)) errors.push(prefix + ': unknown field ' + key);
  if (card.allow_duplicate_topic !== undefined && typeof card.allow_duplicate_topic !== 'boolean') errors.push(prefix + ': allow_duplicate_topic must be a boolean');
  const country = String(card.country ?? '').trim().toLocaleLowerCase('en');
  // The first card with a topic in a country holds it. A later card may share it only if that card itself is marked
  // allow_duplicate_topic; the flag on the first holder exempts nobody else.
  if (country && typeof card.topic_key === 'string' && card.topic_key) {
    const key = country + ':' + card.topic_key;
    if (!topics.has(key)) topics.set(key, index);
    else if (card.allow_duplicate_topic !== true) errors.push(prefix + ': topic_key ' + card.topic_key + ' already used in ' + card.country);
  }
  if (!['draft', 'approved', 'stale'].includes(card.review_status)) errors.push(prefix + ': invalid review_status');
  if (card.photo !== null) {
    const photo = card.photo;
    if (!photo || typeof photo !== 'object') errors.push(prefix + ': photo must be null or an object');
    else {
      for (const key of extraKeys(photo, photoKeys)) errors.push(prefix + ': unknown photo field ' + key);
      if (!allowedLicenses.has(photo.license)) errors.push(prefix + ': unsupported photo license');
      for (const key of ['url', 'license_url', 'source_page']) if (!isHttpsUrl(photo[key])) errors.push(prefix + ': photo.' + key + ' must be an HTTPS URL');
      if (!Number.isInteger(photo.width) || photo.width < 1 || !Number.isInteger(photo.height) || photo.height < 1) errors.push(prefix + ': photo dimensions must be positive integers');
      if (typeof photo.author !== 'string' || !photo.author.trim()) errors.push(prefix + ': photo attribution is required');
    }
  }
}
if (errors.length) { process.stderr.write(errors.map((error) => '- ' + error).join('\n') + '\n'); process.exitCode = 1; }
else process.stdout.write('Validated ' + cards.length + ' stop cards\n');
