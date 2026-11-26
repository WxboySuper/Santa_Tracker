# Admin passkey authentication

Admin sessions are signed, 12-hour cookies backed by a persisted session record. Logging out or revoking a session invalidates it immediately. Cookie-backed mutations require an exact `Origin` and an `X-CSRF-Token` header matching the `admin_csrf` cookie. Logout is the exception: it revokes only the session presented by the caller even if the CSRF check fails, so a browser can always end its own session. A cross-site request can at most sign the owner out. Other cookie mutations still fail on missing or invalid CSRF. Explicit `Authorization: Bearer` requests remain available for API clients and can log out the presented bearer session.

Configure `ADMIN_WEBAUTHN_RP_ID` to the admin site's hostname and `ADMIN_WEBAUTHN_ORIGIN` to its exact HTTPS origin. Production requests fail closed when these values are missing or the request host does not match the relying-party ID. Local development may use the request host and origin.

## Passkey setup and login

Before a passkey is registered, the existing password login can create an owner session. The authenticated owner starts registration with `POST /api/admin/passkeys/register/options`, passing the session's CSRF token for cookie authentication. The response contains WebAuthn creation options and sets a short-lived, HttpOnly challenge cookie. Submit the browser's credential JSON to `POST /api/admin/passkeys/register/verify` with the same session and CSRF token. The first successful registration returns ten recovery codes once; store them offline. Further passkeys can be registered from an authenticated session.

Once a passkey exists, password login is disabled. Begin login with `POST /api/admin/passkeys/login/options`; submit the returned challenge response to `POST /api/admin/passkeys/login/verify`. Both requests require the same short-lived challenge cookie. A successful assertion sets a new admin session and CSRF cookie.

Use one recovery code with `POST /api/admin/passkeys/recovery` and `{ "code": "..." }` if no passkey is available. Each code is consumed atomically after one successful use. A recovery session cannot add or remove passkeys or rotate recovery codes until it submits a second unused code to `POST /api/admin/passkeys/recovery/authorize-management`. This changes only that session's permission and consumes the second code. Authenticated owners can replace the recovery set with `POST /api/admin/passkeys` and view the number of unused codes with `GET /api/admin/passkeys`. The replacement codes are returned once.

`GET /api/admin/passkeys` lists registered credential IDs and transports. `DELETE /api/admin/passkeys` accepts `{ "id": "<credential-id>" }`; at least one passkey must remain registered. Browser clients must send the session's `Origin` and `X-CSRF-Token` header with every cookie-authenticated mutation.

## Sessions, throttling, and audit

`GET /api/admin/sessions` lists active sessions and marks the current one. `DELETE /api/admin/sessions` accepts `{ "sessionId": "<id>" }` and revokes another session. It rejects attempts to revoke the current session; use `POST /api/admin/logout` to end it and clear its cookies. All cookie-authenticated mutation calls, including passkey management and session revocation, require the current `Origin` and double-submit CSRF token.

Password, passkey verification, and recovery attempts share the admin login throttle. Passkey challenge issuance has a separate per-IP limit so repeated options requests cannot consume the password/recovery failure budget. Repeated failures receive HTTP 429 with `Retry-After`. Authentication state stores only recovery-code hashes, credential public keys, session metadata, pending challenges, and a bounded audit trail. Successful and failed login, recovery, registration, logout, and session/passkey revocation paths append audit events.

The state is stored under `admin/auth-state.json` using the configured local or R2 snapshot storage backend. Malformed state fails closed rather than resetting registered credentials or recovery codes; restore a known-good state backup to recover availability. Storage integrity errors surface as unavailable rather than being silently reset. No production data should be used for local validation.
