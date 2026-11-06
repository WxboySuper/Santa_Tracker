export function claim(entity, property) {
  return entity?.claims?.[property]?.find((entry) => entry.rank !== 'deprecated' && entry.mainsnak?.datavalue)?.mainsnak.datavalue.value;
}

export function countryIdFor(entity, administrativeEntities) {
  const administrativeId = claim(entity, 'P131')?.id;
  const administrativeCountry = claim(administrativeEntities[administrativeId], 'P17')?.id;
  return administrativeCountry ?? claim(entity, 'P17')?.id;
}

function validCoordinates(lng, lat) {
  if (!Number.isFinite(lng)) return false;
  if (!Number.isFinite(lat)) return false;
  if (lng < -180) return false;
  if (lng > 180) return false;
  if (lat < -90) return false;
  return lat <= 90;
}

export function coordinatesFromGeometry(geometry) {
  if (!geometry) return undefined;
  if (geometry.type !== 'Point') return undefined;
  if (!Array.isArray(geometry.coordinates)) return undefined;
  const [lng, lat] = geometry.coordinates;
  if (!validCoordinates(lng, lat)) return undefined;
  return { lat, lng };
}

export function validEarthPoint(point) {
  if (!point) return false;
  if (point.globe !== 'http://www.wikidata.org/entity/Q2') return false;
  if (!Number.isFinite(point.latitude)) return false;
  if (!Number.isFinite(point.longitude)) return false;
  if (point.latitude < -90 || point.latitude > 90) return false;
  return point.longitude >= -180 ? point.longitude <= 180 : false;
}

export function timezoneCorrection(id) {
  const corrections = { Q5788: 'Asia/Amman' };
  if (corrections[id]) return corrections[id];
  return undefined;
}
