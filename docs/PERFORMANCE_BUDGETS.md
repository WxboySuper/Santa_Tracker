# Client bundle budgets

The bundle budget report measures gzip-compressed JavaScript and CSS in the Vinext client build. It follows Vite entry, import, and dynamic-import relationships to attribute chunks. A shared chunk is charged to every tier whose route graph reaches it. Filename clues provide fallback attribution. If the Vinext client reference file is missing, the report warns and uses the manifest graph alone. An asset with no graph or filename attribution is charged to the public tier and counted in the report warnings. Symbolic links fail the scan.

The tiers separate the strict public application from lazy 3D features and the admin UI:

| Tier                                                                     | Measured JavaScript |    Budget | Measured CSS |   Budget |
| ------------------------------------------------------------------------ | ------------------: | --------: | -----------: | -------: |
| Public landing and tracker, plus shared chunks                           |           449.4 KiB | 494.3 KiB |     15.2 KiB | 16.7 KiB |
| Lazy 3D chunks, including village and tracker scenes, plus shared chunks |           493.6 KiB | 543.0 KiB |      3.8 KiB |  4.2 KiB |
| Admin chunks, including shared chunks                                    |           125.4 KiB | 138.0 KiB |      0.0 KiB |  0.0 KiB |

These are the baseline measurements from the 2026-11-23 Vinext production build using manifest graph attribution. Budgets start at roughly 10 percent above each non-zero measured size. Admin CSS measured 0 bytes in this build, so its CSS budget is 0. The scan includes client assets outside `_next/static`, such as the service worker and Advent mini-game files. Feature CSS is attributed when the build manifest identifies its source. Seven assets had no route graph or filename attribution and were charged to public; the report includes a warning count for them.

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

The advisory workflow builds the pull request checkout and reads the config from that same checkout. Change a budget by editing `tools/bundle-budget.config.json` in a pull request for the application owner to review. Include the before and after measurements and explain why the new limit is needed. The report fails when a measured tier exceeds its configured limit, but it is not a required check and does not block merging by itself.
