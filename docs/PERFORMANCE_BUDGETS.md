# Client bundle budgets

The bundle budget check measures gzip-compressed JavaScript and CSS in the Vinext client build. It reads the Cloudflare client asset directory and uses the Vite manifest and Vinext client-reference map to attribute chunks to source modules when possible. Unattributed shared chunks stay in the public tier.

The tiers separate the strict public application from lazy 3D features and the admin UI:

| Tier | Measured JavaScript | Budget | Measured CSS | Budget |
| --- | ---: | ---: | ---: | ---: |
| Public landing and tracker, plus shared public chunks | 378.2 KiB | 416.0 KiB | 13.4 KiB | 14.8 KiB |
| Lazy 3D chunks, including village and tracker scenes | 175.8 KiB | 193.4 KiB | 2.5 KiB | 2.8 KiB |
| Admin chunks | 3.5 KiB | 3.9 KiB | 0 KiB | 0 KiB |

These are the baseline measurements from the 2026-11-23 Vinext production build. Budgets start at roughly 10 percent above each measured size. The shared CSS bundle is charged to public; feature CSS is attributed when the build manifest identifies its source.

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
