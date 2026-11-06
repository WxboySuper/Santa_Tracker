# Cache purge

The Worker controls caching with response headers. `apps/web/wrangler.toml` and `apps/web/cloudflare.config.ts` route page and API requests through the Worker. They do not define a custom cache rule. Hashed `/_next/static/` assets use Cloudflare's asset binding and have versioned URLs.

## What can be cached

| Response | Cache behavior | What to expect |
| --- | --- | --- |
| `GET /api/route` while the tracker is public and visible | `public, max-age=0, s-maxage=60, stale-while-revalidate=60` | Cloudflare may serve a response up to 60 seconds old while revalidating, and stale content can be served for another 60 seconds during revalidation. A changed route or newly hidden tracker can therefore take up to about 120 seconds to disappear without a purge. |
| `GET /api/route` while closed, hidden, admin-only, or on error | `private, no-store` | Do not cache the 404 or error response. Admin responses must not enter the shared cache. |
| Advent APIs, including `/api/advent/manifest` and `/api/advent/day/:id` | `private, no-store` | These responses are not cached by the application. The manifest is season-gated and contains calendar metadata, not locked day payloads. |
| `/api/health` | `private, no-store` | Health should be checked from the Worker on every request and is independent of the season gate. |
| Admin API responses | `private, no-store` | Responses can contain private state and must not be shared. |
| Hashed `/_next/static/` files | Versioned asset URLs | A new build emits new hashed URLs. Do not purge these for route, calendar, or flag changes. |

The emergency flag is stored at `emergency/feature-flags.json` in R2 and cached inside each Worker isolate for up to 7 seconds. It does not use the CDN cache. However, a previously cached successful `/api/route` response may continue to be served after the tracker is hidden. Purge `/api/route` immediately after turning on **Hide tracker** if it must disappear at once.

## What to purge after a change

- Route snapshot or route correction: purge `https://santa.weatherboysuper.com/api/route` after activating the desired R2 pointer.
- Tracker emergency hide: purge the same `/api/route` URL after saving the switch. The page gate is dynamic; verify `/tracker` in a private browser session too.
- Advent calendar, manifest, or flag change: these APIs already send `private, no-store`, so they need no application-cache purge. If a URL still shows stale content because of an account-level Cache Rule or prior configuration, purge `/api/advent/manifest` and the affected `/api/advent/day/<id>` URL.
- Worker code deploy: do not purge the zone. Hashed assets change URLs and the application APIs set their own cache headers.

Purge only the URLs that changed. Avoid **Purge Everything** during the Christmas Eve traffic window because it discards unrelated cache entries and sends more requests to the Worker.

## Purge in the Cloudflare dashboard

1. Sign in to Cloudflare and select the zone for `santa.weatherboysuper.com`.
2. Open **Caching** then **Configuration**.
3. In **Purge Cache**, choose **Custom Purge**.
4. Choose **URL** and enter the full URL, for example `https://santa.weatherboysuper.com/api/route`.
5. Submit the purge. Add `/api/advent/manifest` or a specific day URL only when that response appears stale.
6. Request the URL again and inspect the response. A fresh route response should reflect the active pointer; a hidden tracker should return 404 with `Cache-Control: private, no-store`.

Cloudflare moves dashboard labels occasionally. The operation is the zone's single-file purge by full URL, not **Purge Everything**. See [Cloudflare's purge guide](https://developers.cloudflare.com/cache/how-to/purge-cache/).

## Purge with the Cloudflare API

Use a token with **Zone / Cache Purge** permission for the site's zone. Keep the token in a secret manager or environment variable. Obtain the zone ID from the Cloudflare zone overview. The following command documents the request; do not run it as part of a deploy or from this implementation task:

```sh
curl --request POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"files":["https://santa.weatherboysuper.com/api/route"]}'
```

For a manifest correction, include its full URL in `files`:

```json
{"files":["https://santa.weatherboysuper.com/api/advent/manifest"]}
```

The API should return HTTP 200 with `success: true`. Check the `success` field and any `errors` in the response. A purge removes the edge copy; it does not change the R2 active pointer or the Worker's in-memory feature-flag cache. See the [Cloudflare purge API](https://developers.cloudflare.com/api/resources/cache/methods/purge/).
