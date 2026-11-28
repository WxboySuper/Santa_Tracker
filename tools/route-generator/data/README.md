# Route candidate sources

`places.json` comes from Natural Earth's 1:10m populated places simple dataset,
downloaded on 2026-11-06 from
https://naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/.
Natural Earth data is public domain. The snapshot keeps identifiers, names,
country codes, coordinates, population, world-city status, and derived
timezones. Refresh with `node tools/route-generator/refresh-places.mjs`. The
script reads DBF text as UTF-8, rejects points outside the committed country
bounds, and drops duplicate entries for the same named place within 100 km.
Distinct cities with the same name remain separate.

`curated-seeds.json` lists Wikidata item IDs selected as cultural, nature, and
special candidates. It includes the Great Wall, Angkor Wat, Machu Picchu, the
Mexico City candidate, and principal towns for inhabited territories missing
from Natural Earth's populated-place snapshot. `curated.json` records English
labels, ISO country codes, Earth coordinates, source links, and derived
timezones. Wikidata data is available under CC0:
https://www.wikidata.org/wiki/Wikidata:Licensing. Refresh with
`node tools/route-generator/refresh-curated.mjs`. The script follows `P131`
administrative claims when a site's `P17` claim names an obsolete state. It
keeps explicit ISO overrides for dependencies whose place claims name the
sovereign state. Refresh fails if a seed lacks an English label, country, Earth
coordinate, or coordinate inside its committed country bounds.

The other famous-site additions fill clear gaps in the global set: the
[Colosseum](https://www.wikidata.org/wiki/Q10285) and [Burj
Khalifa](https://www.wikidata.org/wiki/Q12495) add European and Asian built
landmarks, [Mount Fuji](https://www.wikidata.org/wiki/Q39231) adds an iconic
natural site, [Christ the Redeemer](https://www.wikidata.org/wiki/Q79961) adds
a South American landmark, and the [Golden Gate
Bridge](https://www.wikidata.org/wiki/Q44440) adds a North American one.
Existing candidates already include major African and Oceanian landmarks, so
those regions did not need another addition.

`COVERAGE.md` lists every ISO 3166-1 entry, a candidate and Christmas 2026
timezone for each permanently inhabited country or territory, and the entries
excluded because they have no permanent civilian population. `country-bounds.json`
combines Natural Earth's admin-0 countries and map units, with documented
It extends the generalized bounds for northern Cyprus, Flying Fish Cove, Cape
Horn, and remote territories attached to Australia, France, the UK, and the US.
Refresh it with
`node tools/route-generator/refresh-country-bounds.mjs`.

The candidate refresh scripts use the pinned `@photostructure/tz-lookup`
dependency. Natural Earth's populated-place data has no timezone field. The
library runs offline and ships a compact timezone boundary index. The snapshots
store the IANA offset for 2026-12-25, including southern-hemisphere daylight
time. The Petra item (Q5788) receives the verified Jordan timezone
`Asia/Amman` because the library assigns its Wikidata point to
`Asia/Jerusalem`.

Refresh bounds first, then curated and populated-place data. Review the derived
JSON and `COVERAGE.md` after each refresh. Candidate coordinates come from
Natural Earth or Wikidata; do not hand-enter them. If a Wikidata item has no
country claim, refresh stops so its location can be reviewed instead of
guessed.
