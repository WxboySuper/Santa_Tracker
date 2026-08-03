# Firestore rules verification for WF-07

## What is checked in

`firestore.rules` is the source of truth for the hosted Firestore rules. The
client writes `cloudCycles/{cycleId}` documents with these top-level fields:

- Required: `id`, `userId`, `label`, `cycleDate`, `createdAt`, `updatedAt`,
  `forecastDays`, `totalOutlooks`, `totalFeatures`, `isReadOnly`, `payloadJson`,
  `payloadBytes`.
- Optional: `payloadHash`, `workflowMetadata`.

`workflowMetadata` is optional, but when present it is an exact metadata map.
Its `outlookVersions` list is at most 32 entries. Each entry can contain only
`version`, `status`, `createdAt`, and optional `derivedFrom`; payload, geometry,
discussion, and other arbitrary fields are rejected. The client-side mirror of
this contract is covered by `src/lib/workflowMetadataContract.test.ts`.

When awareness consent is enabled, the client writes only
`users/{uid}/workflowAwareness/{cycleId}`. Those documents have exactly
`consentVersion`, `schemaVersion`, and `metadata` top-level fields. The nested
metadata is limited to cycle ID, workflow ID, cycle date, status, bounded
outlook-version metadata, and timestamps. It never contains forecast payload,
geometry, discussion, package content, or map views. The client-side shape and
race/delete behavior are covered by `src/lib/workflowAwarenessService.test.ts`
and `src/hooks/useWorkflowAwarenessSync.test.ts`.

## Manual Firebase verification

The repository does not currently include `firebase.json`, `firebase-tools`, or
an emulator test dependency. Consequently, the Jest tests validate the client
contract, but cannot prove Firebase's runtime allow/deny decisions. Authenticated
Firebase verification remains manual.

Exact dashboard steps:

1. In Firebase Console, select the target project and open **Firestore Database
   > Rules**.
2. Load the checked-in `firestore.rules` content into the Rules editor. Do not
   publish it as part of this change; use a project-specific review or the
   Rules Playground available in that console view.
3. Open **Rules Playground** (or the simulator in the Rules editor), choose
   Firestore, and create authenticated test contexts for UIDs `wf07-alice` and
   `wf07-bob`. Also run one unauthenticated context.
4. Run the matrix below against the document paths shown. For queries, use the
   Firestore query simulator with `where('userId', '==', request.auth.uid)` for
   `cloudCycles`; also try a query for another user's UID.
5. Record each simulator result (Allow or Deny) in the PR/checklist before
   promoting rules. Do not treat the Jest result or a successful client build
   as proof of Firebase authorization.

Use `cloudCycles/cycle-a` as the cloud-cycle document path and
`users/wf07-alice/workflowAwareness/cycle-a` as the awareness document path. A
valid cloud-cycle document is:

```json
{
  "id": "cycle-a",
  "userId": "wf07-alice",
  "label": "WF-07 test",
  "cycleDate": "2026-07-13",
  "createdAt": "2026-07-13T00:00:00.000Z",
  "updatedAt": "2026-07-13T00:00:00.000Z",
  "forecastDays": 1,
  "totalOutlooks": 1,
  "totalFeatures": 0,
  "isReadOnly": false,
  "payloadJson": "{}",
  "payloadBytes": 2,
  "workflowMetadata": {
    "id": "WF-severe-day1-2026-07-13",
    "workflowId": "severe-day1",
    "cycleDate": "2026-07-13",
    "status": "in-progress",
    "outlookVersions": [
      { "version": 1, "status": "in-progress", "createdAt": "2026-07-13T00:00:00.000Z" }
    ],
    "createdAt": "2026-07-13T00:00:00.000Z",
    "updatedAt": "2026-07-13T00:00:00.000Z"
  }
}
```

A valid awareness document at
`users/wf07-alice/workflowAwareness/cycle-a` is:

```json
{
  "consentVersion": 1,
  "schemaVersion": 1,
  "metadata": {
    "cycleId": "cycle-a",
    "workflowId": "severe-day1",
    "cycleDate": "2026-07-13",
    "status": "in-progress",
    "outlookVersions": [
      { "version": 1, "status": "in-progress", "createdAt": "2026-07-13T00:00:00.000Z" }
    ],
    "createdAt": "2026-07-13T00:00:00.000Z",
    "updatedAt": "2026-07-13T00:00:00.000Z"
  }
}
```

Run the following matrix and record the result before promoting rules:

| Auth / operation | Expected result |
| --- | --- |
| Alice creates `cycle-a` with the valid document | Allow |
| Alice reads `cycle-a` | Allow |
| Alice updates label or appends a valid metadata-only version | Allow |
| Alice deletes `cycle-a` | Allow |
| Bob reads `cycle-a` | Deny |
| Bob updates `cycle-a`, including changing only `label` | Deny |
| Bob deletes `cycle-a` | Deny |
| Alice creates with `userId: wf07-bob` | Deny |
| Alice updates `userId` to `wf07-bob` | Deny |
| Alice creates with `outlookVersions` containing `payloadJson` or `geometry` | Deny |
| Alice creates with 33 `outlookVersions` entries | Deny |
| Alice creates with a top-level unknown field | Deny |
| Alice creates, reads, updates, or deletes her awareness document | Allow |
| Bob reads, updates, or deletes Alice's awareness document | Deny |
| Alice creates awareness metadata containing `payloadJson`, `geometry`, or another nested unknown field | Deny |
| Alice creates awareness metadata with 33 `outlookVersions` entries | Deny |
| Alice creates awareness data with an unknown top-level field | Deny |
| Signed-in user writes `userMetrics/{uid}` or `userEntitlements/{uid}` | Deny |
| Signed-out user reads or writes any protected document, including awareness | Deny |

For the read/list check, run a query constrained by `where('userId', '==',
request.auth.uid)` as the client does. Also verify that a query for another
user is denied rather than relying only on document reads.

## Optional local emulator setup

If Firebase CLI is available in the verification environment, create a
throwaway `firebase.json` outside this repository (or add one only as an
explicit follow-up), point its Firestore rules path at this checked-in file,
and run:

```sh
firebase emulators:start --only firestore --project demo-wf07
```

Use two emulator-authenticated users and repeat the matrix above with the
Firestore client SDK. This repository intentionally does not claim that path
is executable today: no emulator configuration or Firebase CLI dependency is
checked in, and no deployment is performed by this change.
