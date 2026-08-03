# Alert banner

Site-wide banner from `public/alert-banner.json` at runtime.

## Timed releases

For a manually released stable version with an optional timed rollout, author banner copy in `deploy/production-release.json` under `banner.phases`. CI derives the flat JSON file during deploy:

- **Stage deploy:** pre-rollout phase written to the **live** site (users still on the previous version).
- **Promote at `rolloutAt`:** post-rollout phase written to the new live build.

See [hosted-rollout.md](./hosted-rollout.md) and [production-release.example-v1.6-stage.json](../../deploy/production-release.example-v1.6-stage.json).

## Flat file fields (emergencies / hotfix)

| Field | Description |
|-------|-------------|
| `enabled` | Master switch |
| `message` | Banner text |
| `type` | `info` \| `warning` \| `error` |
| `dismissible` | Show close button |
| `linkUrl` | CTA; paths starting with `/` use in-app routing |
| `linkLabel` | CTA label (default: Learn more) |
| `startsAt` / `expiresAt` | Optional ISO schedule (client does not poll; use phased manifest for timed releases) |
