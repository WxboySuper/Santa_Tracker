import { readFile } from 'node:fs/promises';

const dataPath = process.argv[2] ?? new URL('../content/stop-cards.json', import.meta.url);
const cards = JSON.parse(await readFile(dataPath, 'utf8'));
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
if (!Array.isArray(cards)) throw new Error('Stop cards must be a JSON array');
const placeIds = new Set(); const topics = new Map();
for (const [index, card] of cards.entries()) {
  const prefix = 'cards[' + index + ']';
  if (!card || typeof card !== 'object' || typeof card.place_id !== 'string' || !card.place_id.trim()) { errors.push(prefix + ': place_id is required'); continue; }
  if (placeIds.has(card.place_id)) errors.push(prefix + ': duplicate place_id ' + card.place_id); else placeIds.add(card.place_id);
  if (typeof card.country !== 'string' || !card.country.trim()) errors.push(prefix + ': country is required');
  if (!Array.isArray(card.sources) || card.sources.length === 0 || card.sources.some((source) => typeof source !== 'string' || !/^https:\/\//.test(source))) errors.push(prefix + ': at least one HTTPS source URL is required');
  if (card.note !== null && (typeof card.note !== 'string' || card.note.length < 40 || card.note.length > 280)) errors.push(prefix + ': note must be null or 40 to 280 characters');
  if (card.topic_key !== null && (typeof card.topic_key !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(card.topic_key))) errors.push(prefix + ': topic_key must use lowercase letters, digits, dots, dashes, or underscores');
  if (card.note !== null && (typeof card.topic_key !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(card.topic_key))) errors.push(prefix + ': a note requires a valid topic_key');
  if (typeof card.note === 'string') {
    for (let prior = 0; prior < index; prior++) if (typeof cards[prior].note === 'string' && similarity(card.note, cards[prior].note) >= 0.72) errors.push(prefix + ': note duplicates or closely matches cards[' + prior + ']');
    const country = String(card.country ?? '').toLocaleLowerCase('en');
    if (country && card.topic_key && !card.allow_duplicate_topic) {
      const key = country + ':' + card.topic_key;
      if (topics.has(key) && !cards[topics.get(key)].allow_duplicate_topic) errors.push(prefix + ': topic_key ' + card.topic_key + ' already used in ' + card.country);
      else topics.set(key, index);
    }
  }
  if (!['draft', 'approved', 'stale'].includes(card.review_status)) errors.push(prefix + ': invalid review_status');
  if (card.photo !== null) {
    const photo = card.photo;
    if (!photo || typeof photo !== 'object') errors.push(prefix + ': photo must be null or an object');
    else {
      if (!allowedLicenses.has(photo.license)) errors.push(prefix + ': unsupported photo license');
      for (const key of ['url', 'license_url', 'source_page']) if (typeof photo[key] !== 'string' || !/^https:\/\//.test(photo[key])) errors.push(prefix + ': photo.' + key + ' must be an HTTPS URL');
      if (!Number.isInteger(photo.width) || photo.width < 1 || !Number.isInteger(photo.height) || photo.height < 1) errors.push(prefix + ': photo dimensions must be positive integers');
      if (typeof photo.author !== 'string' || !photo.author.trim()) errors.push(prefix + ': photo attribution is required');
    }
  }
}
if (errors.length) { process.stderr.write(errors.map((error) => '- ' + error).join('\n') + '\n'); process.exitCode = 1; }
else process.stdout.write('Validated ' + cards.length + ' stop cards\n');
