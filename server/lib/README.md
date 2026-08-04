# Server libraries

`server/lib` contains reusable server-side policy and infrastructure helpers:
capabilities, deployment targets, production release state, and emergency
overrides.

These modules must remain independent of Express request handling where
possible. Keep policy pure and test failure/disabled paths, especially for
server-backed feature exposure.
