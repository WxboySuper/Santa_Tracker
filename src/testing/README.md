# Test support

`src/testing` contains reusable test harnesses, fixtures, and exposure test
types. It supports tests but is not a runtime feature boundary.

Keep harness behavior deterministic and isolated from production modules.
Update the affected test suites when a harness or fixture contract changes.
