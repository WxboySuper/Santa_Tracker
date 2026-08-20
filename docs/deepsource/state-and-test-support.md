# State and test-support documentation policy

State helpers should document the boundary they protect rather than repeat their symbol names. In particular:

- Custom-layer utilities preserve ordering, normalize persisted values, and keep reducer updates immutable.
- Forecast selectors read the active cycle or day and should state their fallback behavior when a day is absent.
- Verification selectors expose forecast data for grading and should identify whether they return the active day, a requested day, or the complete forecast.
- Test harness helpers create isolated stores, mount probe components, or wait for user-visible state. Their documentation should name the observable condition they establish.

Test fixtures are not analyzed for JS-D1001 in this repository. Comments inside a fixture or function body should therefore be added only when they explain a non-obvious setup invariant; a symbol-name comment is not useful documentation.
