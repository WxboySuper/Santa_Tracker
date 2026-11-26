import { readFile, writeFile } from 'node:fs/promises';
import { admin1CodeAt, loadAdmin1Features } from './admin1.mjs';

const featurePolygons = await loadAdmin1Features();
const files = ['places.json', 'curated.json'];
const unassigned = [];
let assigned = 0;
for (const file of files) {
  const path = new URL(`./data/${file}`, import.meta.url);
  const places = JSON.parse(await readFile(path, 'utf8'));
  const enriched = places.map((place) => {
    const admin1Code = admin1CodeAt(place, featurePolygons);
    if (admin1Code === undefined) return place;
    if (admin1Code === null) {
      unassigned.push(`${place.country} ${place.id} ${place.name}`);
      return { ...place, admin1Code: null };
    }
    assigned++;
    return { ...place, admin1Code };
  });
  const spacing = file === 'places.json' ? 0 : 2;
  await writeFile(path, `${JSON.stringify(enriched, null, spacing)}\n`, 'utf8');
}
process.stdout.write(`Tagged ${assigned} US, Canadian and Australian candidates with Natural Earth admin-1 codes.\n`);
process.stdout.write(`Unmatched candidates: ${unassigned.length}${unassigned.length ? ` (${unassigned.join('; ')})` : ''}\n`);
