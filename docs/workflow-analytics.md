# Workflow analytics event dictionary

Workflow analytics is an opt-in, metadata-only observation layer. Every event passes through `trackWorkflowEvent`; callers cannot send arbitrary records. The adapter rejects unknown event names, unknown dimensions, invalid enum values, and nested content. It never throws into forecast editing, saving, completion, export, or rollover.

## Events

`start`, `continue`, `derive`, `revise`, `complete`, `complete-with-omissions`, `export`, and `rollover-action` are the only event names. They represent successful action boundaries, except `export`, which may carry a normalized `failure` result.

## Dimensions

Permitted dimensions are `dayGrouping`, `accountTier`, `entryPath`, `result`, `packageScope`, and `action`. Values are closed enums. Coordinates, geometry, discussions, labels, filenames, images, package contents, map/layer state, raw errors, and arbitrary metadata are prohibited.

Signed-out behavior follows the existing page analytics policy: hosted pages may emit aggregate metadata; localhost and `127.0.0.1` are no-ops. Callers may explicitly disable tracking for an opted-out session. Provider errors are swallowed. The configured retention period is not verified in this repository and must not be inferred from this client contract.
