# Server test support

`server/testing` contains reusable server fixtures and exposure harnesses. Test
helpers may depend on server contracts but must not become production imports.

When a fixture models persisted or upstream data, keep it representative of the
serialized shape and document intentional simplifications.
