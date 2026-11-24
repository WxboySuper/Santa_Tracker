# Season modes

The annual season mode is a date-derived product state. `seasonMode(now, config)` reads the UTC schedule shared with `season.ts`:

| Mode | UTC dates | Purpose |
| --- | --- | --- |
| Off-season | Jan 7 through Oct 31, then until the next schedule starts | Countdown, archive, and replay period |
| Preparation | Nov 1 through Nov 30 | Previews and North Pole preparation |
| Advent | Dec 1 through Dec 23 | Advent activities and daily unlocks |
| Flight | Dec 24 | Live Santa journey |
| Post-season | Dec 25 through Jan 6 | Celebration, completed journey, and replay |

Each range starts at 00:00 UTC on its first date and ends at 00:00 UTC on the next mode's first date. Jan 1 through Jan 6 belongs to the season that began the previous November. The current public feature gates remain independent and unchanged: Advent becomes accessible Nov 30, the tracker opens ten minutes before its scheduled takeoff, and both gates close Jan 7.

## Admin override

The admin season-mode API can temporarily select any of the five modes. A set operation requires a reason and an explicit UTC expiry. The server records `setAt` and `setBy`, and rejects expiries in the past or more than 48 hours after the set time. The single-owner admin session is recorded as `admin` because authentication does not expose a personal identity.

An active override replaces only the derived season mode until `expiresAt`. At the expiry instant it stops applying. The record remains stored and the admin read endpoint reports `overrideStatus: "expired"` until an admin clears or replaces it. A clear or replacement appends an audit entry with the authenticated actor, server time, action, and previous override. Writes use the current ETag in `If-Match`; stale writes fail with HTTP 412 and do not update the record.

## Emergency feature switches

Season modes describe the product's annual state. The existing emergency switches are separate safety controls for the Advent and tracker feature gates. Hiding a feature through an emergency switch continues to close its public gate regardless of the derived or overridden season mode. A season-mode override does not enable hidden features or change their date windows.

The derived and effective modes are available to admin code only for now. Public pages and APIs continue to use the existing feature gates until a later change adopts season modes deliberately.
