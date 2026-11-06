export function claim(entity, property) {
  return entity?.claims?.[property]?.find((entry) => entry.rank !== 'deprecated' && entry.mainsnak?.datavalue)?.mainsnak.datavalue.value;
}

export function coordinatesFromGeometry(geometry) {
  if (!geometry || geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) return undefined;
  const [lng, lat] = geometry.coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return undefined;
  return { lat, lng };
}

export function validEarthPoint(point) {
  if (!point || point.globe !== 'http://www.wikidata.org/entity/Q2') return false;
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return false;
  if (point.latitude < -90 || point.latitude > 90) return false;
  return point.longitude >= -180 && point.longitude <= 180;
}
