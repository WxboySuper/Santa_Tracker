# Browser matrix, November 2026

Run date: 2026-11-23. This was a local Windows run against the E2E suite's temporary Next.js servers and fixture data. No deploy, remote command, production request, or production write was made.

The default Playwright projects, `closed` and `open`, remain unchanged unless `E2E_MATRIX=1` is set. The opt-in matrix adds eight browser/device profiles, each with open and closed fixture variants, for 16 matrix projects total. Profiles include Chromium, Firefox, and WebKit desktop runs, iPhone 13, Pixel 5, and iPad emulation, a 3840x2160 desktop viewport, and a 740x360 landscape phone viewport. These are browser builds and emulated viewports. They do not establish behavior on physical devices. On Windows, Playwright WebKit is its own WebKit build, not Safari. The iPhone and iPad projects use that same WebKit build with Playwright device descriptors.

The full matrix was rerun after correcting the desktop Firefox and WebKit descriptors to use `Desktop Firefox` and `Desktop Safari` respectively. The desktop WebKit run therefore used Safari's user agent, not Chrome's. The results below are from that corrected run. WebKit failures are reported as automation findings that need real Safari confirmation; they are not assumed to be Safari product defects. In particular, Safari keyboard navigation can depend on the user's setting for tabbing through webpage controls.

## Page results

Each open browser/device profile captured the five requested pages. `Pass` means the screenshot and applicable automated checks passed. `Fail` names an automated failure described below; for WebKit, the failure needs confirmation in real Safari. For landscape phone, the axe test stopped on the tracker text view, so axe did not reach Advent or the village; their screenshots were captured. Closed fixture variants run the closed-route, API, visitor, and authenticated Advent preview tests separately.

| Browser or emulated profile | Home | Tracker map | Tracker text | Advent calendar | Village static |
| --- | --- | --- | --- | --- | --- |
| Chromium desktop, 1280x720 | Pass | Pass | Pass | Pass | Pass |
| Firefox desktop, 1280x720 | Pass | Pass | Pass | Pass | Pass |
| WebKit desktop, 1280x720 | Fail: keyboard-navigation setting | Fail: Escape does not exit immersive mode; verify in Safari | Pass | Pass | Pass |
| iPhone 13 emulation, 390x844 | Fail: keyboard-navigation setting | Fail: Escape does not exit immersive mode; verify in Safari | Pass | Pass | Pass |
| Pixel 5 emulation, 393x851 | Pass | Pass | Pass | Pass | Pass |
| iPad (gen 7) emulation, 810x1080 | Fail: keyboard-navigation setting | Fail: Escape does not exit immersive mode; verify in Safari | Pass | Pass | Pass |
| Chromium desktop, 3840x2160 | Pass | Pass | Pass | Pass | Pass |
| Chromium landscape phone, 740x360 | Pass | Pass | Fail: serious axe finding | Captured; axe not reached | Captured; axe not reached |

Closed route and API gate checks passed on all eight browser/device profiles. The authenticated Advent preview axe check passed on Chromium, Firefox, Pixel 5, 4K desktop, and landscape phone. It failed on WebKit desktop, iPhone 13 emulation, and iPad emulation after API login returned 200 but the page still showed a visitor 404. The admin emergency-switch check failed on the same three WebKit-based profiles. The exact findings and reproduction steps follow.

## Findings

### Serious axe finding in tracker text view

- Page: `/tracker`, after switching from map to text view.
- Profile: Chromium mobile emulation at 740x360, `matrix-open-phone-landscape-740x360`.
- Result: axe 4.14 reports `scrollable-region-focusable` with serious impact on `<section aria-label="Show text view">`. The scrollable region is not keyboard focusable.
- Reproduction: set `E2E_MATRIX=1`, then run `pnpm e2e --project=matrix-open-phone-landscape-740x360 --grep 'key public pages pass serious and critical axe checks'`. This failed in the full matrix and again in an isolated rerun.
- Screenshot: `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-phone-landscape-740x360\tracker-text.png`.

### Safari keyboard-navigation behavior needs manual confirmation

- Page: `/`.
- Profiles and initial viewports: WebKit desktop, 1280x720; iPhone 13 emulation, 390x844; iPad (gen 7) emulation, 810x1080.
- Result: `public-site.spec.ts` presses Tab once after navigation and does not find focus on the "Skip to content" link in all three WebKit-based profiles. This persists in the corrected full run. It is not classified as a confirmed defect: Safari can be configured not to tab through links and other webpage controls unless its keyboard-navigation setting is enabled. This Windows WebKit build is not Safari and cannot reproduce the user's macOS setting.
- Reproduction: set `E2E_MATRIX=1`, then run `pnpm e2e --project=matrix-open-webkit --project=matrix-open-iphone-13 --project=matrix-open-ipad-gen-7 --grep 'home works at narrow widths, with motion settings, and passes axe'`. The same automation assertion failed in the three `matrix-closed-*` variants.
- Screenshots: `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-webkit\home.png`, `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-iphone-13\home.png`, and `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-ipad-gen-7\home.png`.

### Windows WebKit automation did not leave tracker immersive mode

- Page: `/tracker?mode=immersive`.
- Profiles: WebKit desktop, iPhone 13 emulation, and iPad (gen 7) emulation. The existing spec sets the viewport to 1440x900 before this check, including in the emulated device projects.
- Steps: search for London, press Escape to close the search results, select London, wait for the arrival text, then press Escape again. The expected "Enter immersive mode" button is absent. The assertion failed on all three profiles in the corrected full run, with the expected Safari descriptor on desktop. This remains a WebKit automation finding until checked in real Safari.
- Reproduction: set `E2E_MATRIX=1`, then run `pnpm e2e --project=matrix-open-webkit --project=matrix-open-iphone-13 --project=matrix-open-ipad-gen-7 --grep 'tracker opens immersive mode and lets a visitor choose a city'`.
- Screenshots: `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-webkit\tracker-after-escape.png`, `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-iphone-13\tracker-after-escape.png`, and `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-ipad-gen-7\tracker-after-escape.png`. These captures use the same 1440x900 viewport.

### WebKit admin login state needs real-browser confirmation

- Page: `/admin`, first viewport 1440x900 in the existing test.
- Profiles: WebKit desktop, iPhone 13 emulation, and iPad (gen 7) emulation.
- Steps: post the local E2E password to `/api/admin/login` and confirm HTTP 200, navigate to `/admin`, then find the `Hide tracker` switch. The switch was absent on all three profiles in the corrected full run. The screenshot shows the login form still displayed. This may reflect WebKit cookie/session behavior; validate in real Safari before treating it as a product defect.
- Reproduction: set `E2E_MATRIX=1`, then run `pnpm e2e --project=matrix-open-webkit --project=matrix-open-iphone-13 --project=matrix-open-ipad-gen-7 --grep 'emergency switches work at desktop and mobile sizes with keyboard confirmation'`.
- Screenshots: `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-webkit\admin-emergency-switches.png`, `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-iphone-13\admin-emergency-switches.png`, and `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-ipad-gen-7\admin-emergency-switches.png`.

### WebKit authenticated Advent preview needs real-browser confirmation

- Page: `/advent` in the closed fixture, expected to show 24 calendar entries for the logged-in admin.
- Profiles and viewports: WebKit desktop, 1280x720; iPhone 13 emulation, 390x844; iPad (gen 7) emulation, 810x1080.
- Steps: post the local password to `/api/admin/login`, confirm HTTP 200, open `/advent`, then count list items. The page had zero instead of 24 in all three profiles in the corrected full run. Visitor gating passed. This follows the same apparent login-state failure as the admin check and has not been diagnosed separately; verify both flows in real Safari.
- Reproduction: set `E2E_MATRIX=1`, then run `pnpm e2e --project=matrix-closed-webkit --project=matrix-closed-iphone-13 --project=matrix-closed-ipad-gen-7 --grep 'accessible Advent calendar in the closed project matches axe'`.
- Supporting screenshots: `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-webkit\admin-emergency-switches.png`, `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-iphone-13\admin-emergency-switches.png`, and `C:\Users\super\AppData\Local\Temp\santa-tracker-browser-matrix-2026-11\matrix-open-ipad-gen-7\admin-emergency-switches.png` show the login form remains present after API login.

### One Chromium timeout did not recur

The full run timed out after 60 seconds in the Chromium desktop home test. Its isolated rerun passed in 24.3 seconds, so I have not counted it as a confirmed defect.

## Run results

The corrected full command ran 323 tests across the two default projects and 16 opt-in matrix projects: 184 passed, 16 failed, 99 were skipped, and 24 did not run after failures in serial test groups. Fifteen failures came from the three WebKit-based profiles across open and closed fixtures. These remain Windows WebKit automation failures after the UA correction; real Safari behavior is still unverified. The landscape axe failure is the confirmed accessibility defect and repeated in isolation. A Chromium desktop home timeout from an earlier run did not recur in the corrected full run.

The screenshot capture passed for all eight open browser/device profiles. It saved seven PNGs per profile under the scratch folder shown above: home, tracker map, tracker text, Advent calendar, village static, the tracker state after Escape, and the admin emergency-switch page. The screenshots are not committed. The closed fixture variants intentionally return 404 for visitor requests, so content screenshots come from each profile's open fixture run.

Local checks passed: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (84 files, 577 tests). After Playwright generated `playwright-report/` and `test-results/`, a second bare `pnpm lint` scanned generated JavaScript and failed; `pnpm lint -- --ignore-pattern playwright-report/** --ignore-pattern test-results/**` passed with those artifacts present. The full Playwright matrix did not pass because of the failures recorded above.

## Commands to rerun

Run these in Windows PowerShell from the repository root:

```powershell
pnpm install --frozen-lockfile
node node_modules/.pnpm/playwright@1.65.1/node_modules/playwright/cli.js install chromium firefox webkit

$env:E2E_MATRIX = '1'
$env:E2E_CAPTURE_MATRIX = '1'
$env:E2E_MATRIX_SCREENSHOT_DIR = Join-Path $env:TEMP 'santa-tracker-browser-matrix-2026-11'
pnpm e2e
```

To capture only the seven screenshots per profile, keep the three environment variables above and run:

```powershell
pnpm e2e --grep 'capture key pages for the browser matrix'
```

The following focused runs reproduce the confirmed findings:

```powershell
$env:E2E_MATRIX = '1'
pnpm e2e --project=matrix-open-phone-landscape-740x360 --grep 'key public pages pass serious and critical axe checks'
pnpm e2e --project=matrix-open-webkit --project=matrix-open-iphone-13 --project=matrix-open-ipad-gen-7 --grep 'home works at narrow widths, with motion settings, and passes axe'
pnpm e2e --project=matrix-open-webkit --project=matrix-open-iphone-13 --project=matrix-open-ipad-gen-7 --grep 'tracker opens immersive mode and lets a visitor choose a city'
pnpm e2e --project=matrix-open-webkit --project=matrix-open-iphone-13 --project=matrix-open-ipad-gen-7 --grep 'emergency switches work at desktop and mobile sizes with keyboard confirmation'
pnpm e2e --project=matrix-closed-webkit --project=matrix-closed-iphone-13 --project=matrix-closed-ipad-gen-7 --grep 'accessible Advent calendar in the closed project matches axe'

pnpm lint
pnpm typecheck
pnpm test
```

## Owner-run manual checks

The following work needs real devices and assistive technology:

- **NVDA with Firefox on Windows:** Tab through the home page and confirm the skip link receives focus. Review headings and landmarks. On the tracker, move between map controls and the text route, read each stop and arrival, then check the Advent links and game controls.
- **VoiceOver with Safari on a real iPhone and iPad:** Use the rotor for headings and links. Swipe through tracker controls and stops, switch between map and text, review the Advent calendar, rotate between portrait and landscape, and repeat with reduced motion enabled.
- **TalkBack with Chrome on a real Android phone:** Swipe through headings and controls in order. Check map labels, the text route and stop announcements, Advent cards and game controls. Repeat in landscape and with larger text.
- **Physical browser/device coverage:** Repeat the key page flows in current iOS Safari and Android Chrome. Check touch targets, orientation changes, map fallback, and that keyboard or assistive-technology focus can scroll the tracker text region.
