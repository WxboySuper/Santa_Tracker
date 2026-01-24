## 2024-12-07 - Stored XSS in Admin Dashboard
**Vulnerability:** Found `innerHTML` interpolation of user-controlled data (`loc.name`) in `admin.html` within `displaySimulationResults` and `simulateTrialRoute` functions.
**Learning:** Even in admin panels, output encoding is crucial. `escapeHtml` utility was present but missed in these specific functions.
**Prevention:** Always use `textContent` or escape helpers when injecting dynamic data into HTML strings. Audit all usage of `innerHTML` or template literal interpolation in JS.
