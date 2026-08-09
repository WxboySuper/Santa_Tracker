# Cloud-cycle storage contract

Issue: [#709](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/709)

## Ownership

Each `cloudCycles/{cycleId}` document contains metadata and the server-derived
`payloadBytes` value. The serialized forecast is stored separately at
`cloudCycles/{cycleId}/payload/payload`.

The client lists metadata only. Loading or deleting one cycle performs the
additional payload-document operation for that cycle. The server validates the
payload size and derives the UTF-8 byte count from the received JSON; clients do
not define the persisted byte count.

## Bounded operations

The save endpoint checks the per-user quota with a `limit(MAX_CLOUD_CYCLES + 1)`
query. It never downloads payload documents or scans an unbounded tenancy-wide
set while saving one cycle. Admin storage metrics use Firestore count and sum
aggregates. The capped scan is an emulator/test-double fallback only and is
limited to 1,001 documents.

## Migration and rollback

Legacy inline payloads remain readable. A legacy read writes the metadata and
payload to the new locations in one batch, then clears the old user-settings
field. If the batch or cleanup fails, the legacy source remains available and
the next read retries the migration. The old field is removed only after the
new documents have been committed, so rollback is a matter of retaining the
legacy source until the new path has been verified.

## Reconciliation

`payloadBytes` is the exact UTF-8 byte length of each stored JSON payload.
Storage metrics sum those per-cycle values and add documented fixed metadata
overhead estimates for the admin dashboard. The aggregate path is the source
of truth; the short cache reduces repeated admin reads without changing the
stored data contract.
