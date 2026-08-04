# Weather generation

`server/weather` contains weather-generation and Auto-TSTM support code. It
normalizes upstream or model inputs into server contracts before they reach
the API response.

Keep generation deterministic where possible, validate input at the boundary,
and test malformed, stale, empty, and upstream-failure cases with fixtures.
