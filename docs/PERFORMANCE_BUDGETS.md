# Client bundle budgets

The bundle budget check measures gzip-compressed JavaScript and CSS in the Vinext client build. It reads the manifest-bearing client asset directory and follows Vite entry, import, and dynamic-import relationships to attribute chunks. A shared chunk is charged to every tier whose route graph reaches it, so shared dependencies cannot hide growth in a smaller 3D or admin budget. Filename clues are a fallback for assets with no route in the manifest graph. Assets outside the graph and without filename clues are charged to every tier, and symbolic links fail the scan.

The tiers separate the strict public application from lazy 3D features and the admin UI:

| Tier                                                                     | Measured JavaScript |    Budget | Measured CSS |   Budget |
| ------------------------------------------------------------------------ | ------------------: | --------: | -----------: | -------: |
| Public landing and tracker, plus shared chunks                           |           385.4 KiB | 424.0 KiB |     15.2 KiB | 16.7 KiB |
| Lazy 3D chunks, including village and tracker scenes, plus shared chunks |           501.0 KiB | 551.0 KiB |     17.7 KiB | 19.5 KiB |
| Admin chunks, including shared chunks                                    |           132.8 KiB | 146.0 KiB |     13.9 KiB | 15.3 KiB |

These are the baseline measurements from the 2026-11-23 Vinext production build using manifest graph attribution. Budgets start at roughly 10 percent above each measured size. The scan includes client assets outside `_next/static`, such as the service worker and Advent mini-game files. Feature CSS is attributed when the build manifest identifies its source.

## Run the check locally

From the repository root, build the client assets and measure them. On PowerShell:

```powershell
cd apps/web
$env:VINEXT_BUILD = '1'
$env:SECRET_KEY = 'local-build-secret'
$env:ADMIN_PASSWORD = 'local-build-password'
pnpm exec vite build
cd ../..
node tools/bundle-budget.mjs
```

On macOS or Linux, set the same three variables before running `pnpm exec vite build` from `apps/web`. The checker prints a Markdown report with tier totals and the largest chunks. In GitHub Actions it also appends that report to the job summary and exits unsuccessfully when a limit is exceeded.

## Change a budget

Update the relevant byte limit in [`tools/bundle-budget.config.json`](../tools/bundle-budget.config.json) only after rebuilding and reviewing the report. The byte limits are gzip sizes, not source sizes or raw build sizes. If a module moves between public, 3D, or admin, check its manifest attribution and update the tier baseline only when the ownership change is understood.

Any increase to a committed limit needs explicit approval from the application owner in the pull request review. Include the before and after measurements and the reason the larger budget is needed. Bundle budget and PR hygiene workflows are informative checks and are not required branch-protection checks.
