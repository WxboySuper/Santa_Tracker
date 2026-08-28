# Issue #622 population and cities evaluation

## Recommendation

Use the public WorldPop v2 population endpoint for the beta population estimate. It accepts an arbitrary GeoJSON `Polygon` or `MultiPolygon`, performs the grid intersection on the service, and returns a modeled population total. GFC unions overlapping forecast polygons before submission so residents are counted once.

This beta should remain an on-demand research tool. It is not an official impact estimate, warning product, or precise count of people exposed to a hazard.

## Candidate sources

| Candidate | Result | Reason |
| --- | --- | --- |
| WorldPop REST API v2 | Selected | Free unauthenticated polygon query, global population grids, and a response containing the estimated total and data metadata. |
| U.S. Census ACS API | Not sufficient alone | Free and authoritative for U.S. tabular estimates, but its standard geography endpoints do not provide one global arbitrary-polygon population query. It could be a future U.S.-specific comparison source. |
| GHSL/Copernicus population grids | Not selected for beta | Useful open raster data, but GFC would need to host the files and run raster clipping/intersection infrastructure. That adds storage, processing, and update-management cost. |
| OpenStreetMap, Overture, and geocoders | Not a population source | These can identify places or city boundaries, but they do not provide a consistent population total for arbitrary forecast polygons. They remain candidates for a separate affected-cities feature. |

## WorldPop constraints and attribution

- The v2 API does not require authentication for exploratory use.
- The published unauthenticated limit is 1,000 API calls per day and the maximum polygon area is 50,000 km². Higher limits require an approved API key.
- WorldPop data is published under CC BY 4.0. The UI links to WorldPop and identifies the result as modeled data.
- WorldPop describes the data as provided without a guarantee of accuracy, completeness, or fitness for a specific purpose. The beta disclaimer reflects that limitation.
- The service is asynchronous. GFC uses a 30-second client timeout and does not retry automatically.

Sources: [WorldPop API v2](https://api.worldpop.org/v2/), [WorldPop API rate limits](https://www.worldpop.org/sdi/api_rate_limits/), and [WorldPop FAQ and licensing](https://www.worldpop.org/faq/).

## Browser versus server access

The beta calls the public endpoint from the browser because the endpoint is reachable without a key and the current request is user initiated. The client enforces a timeout, supports cancellation, and exposes upstream errors without storing user polygons.

Before making this permanent, move requests behind a GFC server proxy or add a shared cache. That would allow quota management, request deduplication, abuse protection, and a future API key without exposing it to browsers. The beta deliberately does not promise quota protection or automatic retries.

## Cities scope

The population endpoint answers “how many people are inside this geometry,” not “which cities are affected.” City reporting needs a second dataset with place boundaries or point locations and a clearly defined overlap rule. That is deferred from this beta so the population estimate can be validated independently. The PR is therefore related to #622 rather than claiming that the full population-and-cities research issue is complete.
