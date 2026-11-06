# Route candidate sources

`places.json` is derived from Natural Earth's 1:10m populated places simple dataset,
downloaded on 2026-11-05 from
https://naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/.
Natural Earth data is public domain. The snapshot keeps identifiers, names, countries,
coordinates, population, world-city status, and a derived timezone. Refresh with
`node tools/route-generator/refresh-places.mjs`.

`curated-seeds.json` lists Wikidata item IDs selected as cultural, nature, and
date-line or equator candidates. `curated.json` records their English labels,
country, Earth coordinates, source links, and derived timezones. The Wikidata
data is available under CC0: https://www.wikidata.org/wiki/Wikidata:Licensing.
The snapshot was fetched on 2026-11-05. For historical sites whose `P17` claim
names an obsolete state, refresh follows the site's `P131` administrative entity
to its `P17` country when available. Refresh it with
`node tools/route-generator/refresh-curated.mjs`. Refresh fails if a seed lacks
an English label, country, or Earth coordinate, so it cannot silently invent one.

Both scripts use `@photostructure/tz-lookup` 11.7.0 for all points. Natural Earth's
simple dataset has no timezone field. The library runs offline and ships a compact
timezone boundary index; the generator therefore does not need a network service.
Timezone boundaries, especially for remote islands or disputed areas, can change
or be approximate. Review a candidate's local time before approving it.
The coordinate library assigns Petra (Q5788) to Asia/Jerusalem at its Wikidata
point; the refresh script applies the verified Jordan timezone Asia/Amman for
that QID after still running the library lookup.
