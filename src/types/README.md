# Shared types

`src/types` contains contracts shared across pages, components, state, and
utilities: outlooks, workflows, cloud cycles, and weather-generation shapes.

Types should describe stable contracts, not import feature implementations.
When changing a serialized shape, update compatibility handling and persisted
fixtures before changing consumers.
