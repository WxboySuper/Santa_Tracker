# Localization boundary

The UI uses `@santa-tracker/localization` for user-facing messages. English is the default catalog. `createTranslator` first checks the requested locale, then the configured fallback locale, then returns the message key when no copy exists. That last behavior keeps missing strings visible in tests and logs instead of silently displaying an empty label.

Stable content data belongs in `@santa-tracker/contracts`. `LocalizedContentSchema` keeps an ID and numeric ordering separate from locale-keyed title and description text. Route coordinates, timestamps, and other numeric or machine-readable values remain data fields, not translated strings.

To add a message, add a typed key to `packages/localization/src/messages.ts`, use `t("key")` at the UI boundary, and add a fallback test when the message has interpolation or special locale behavior. English is the only shipped catalog in this PR. Callers that need another catalog or locale should create a translator with `createTranslator({ locale, catalogs })`; request locale negotiation and provider wiring belong to the follow-up that adds translated catalogs.
