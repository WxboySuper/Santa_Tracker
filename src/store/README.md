# Client state

`src/store` configures Redux and owns client state transitions. `index.ts`
exports the store, `RootState`, and `AppDispatch`; slices own feature state and
reducers while selectors provide read access.

Keep reducers pure and keep network/service code in dedicated modules. Shared
serialized shapes belong in `src/types`. Update colocated slice tests for state
shape changes and run `pnpm test -- --runInBand` when debugging persistence.
