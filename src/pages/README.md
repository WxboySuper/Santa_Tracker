# Route pages

Pages are route-level composition surfaces. They assemble feature components,
connect route parameters, and coordinate navigation; they are not a dumping
ground for reusable domain algorithms.

Key entry points are `ForecastPage.tsx`, `DiscussionPage.tsx`,
`MonitorPage.tsx`, `VerificationPage.tsx`, `HomePage.tsx`, and
`AccountPage.tsx`. Keep page-specific orchestration close to the page, and
move reusable workflows to `src/hooks` or pure transformations to `src/utils`.
Update page tests when route behavior changes.
