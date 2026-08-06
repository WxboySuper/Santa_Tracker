/**
 * Single source of truth for runtime boundary GeoJSON datasets.
 *
 * These datasets were previously fetched from mutable upstream branch URLs
 * (`master`), so an upstream change or outage could alter the product without
 * a GFC release. They are now vendored under `public/geodata` with pinned
 * SHA-256 checksums recorded here. The integrity of the vendored files is
 * verified automatically by `scripts/validate-geo-assets.mjs` during CI.
 */

export interface GeoBoundarySource {
  /** Unique key used to identify the dataset. */
  key: 'usStates' | 'worldCountries' | 'lakes';
  /** URL resolved at runtime (a vendored, content-addressed public asset). */
  url: string;
  /** Path to the vendored file relative to the repository root. */
  vendoredPath: string;
  /** SHA-256 checksum of the vendored file. */
  sha256: string;
  /** Upstream project and file the dataset was retrieved from. */
  origin: string;
  /** License of the upstream dataset. */
  license: string;
  /** ISO date the vendored revision was retrieved. */
  retrievedAt: string;
}

const RETRIEVED_AT = '2026-08-04';

/** Runtime boundary datasets routed through one source definition. */
export const GEO_BOUNDARY_SOURCES: Record<GeoBoundarySource['key'], GeoBoundarySource> = {
  usStates: {
    key: 'usStates',
    url: 'geodata/us-states.json',
    vendoredPath: 'public/geodata/us-states.json',
    sha256: '6F23ED91FCE2C25D57C01D83225342BA40258E9571C486C3999BD827C80D193B',
    origin: 'https://github.com/PublicaMundi/MappingAPI (data/geojson/us-states.json)',
    license: 'Public domain (US states boundaries; source data from US Census TIGER)',
    retrievedAt: RETRIEVED_AT,
  },
  worldCountries: {
    key: 'worldCountries',
    url: 'geodata/ne_110m_admin_0_countries.geojson',
    vendoredPath: 'public/geodata/ne_110m_admin_0_countries.geojson',
    sha256: '6866C877D39CBA9C357620878839B336D569F8C662D3CFAB4CB1DBE2D39C977F',
    origin: 'https://github.com/nvkelso/natural-earth-vector (geojson/ne_110m_admin_0_countries.geojson)',
    license: 'Public domain (Natural Earth data)',
    retrievedAt: RETRIEVED_AT,
  },
  lakes: {
    key: 'lakes',
    url: 'geodata/ne_110m_lakes.geojson',
    vendoredPath: 'public/geodata/ne_110m_lakes.geojson',
    sha256: 'EB02ECC86C82004FCCBF979058BFABBBD6C2D07968C7844D38EB1C9152D2FFC9',
    origin: 'https://github.com/nvkelso/natural-earth-vector (geojson/ne_110m_lakes.geojson)',
    license: 'Public domain (Natural Earth data)',
    retrievedAt: RETRIEVED_AT,
  },
};

/** Looks up a vendored boundary dataset by key. */
export const getGeoBoundarySource = (
  key: GeoBoundarySource['key'],
): GeoBoundarySource => GEO_BOUNDARY_SOURCES[key];
