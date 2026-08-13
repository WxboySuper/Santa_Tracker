## 2024-05-23 - Mocking Infinite Loops
**Learning:** Mocking hooks like `useMap` with a function that returns a new object on every call can trigger infinite re-render loops in components that use the hook return value in `useEffect` dependencies.
**Action:** Use a stable object reference (defined outside the mock factory or using `const`) when mocking hooks that return objects.

## 2024-05-23 - React Leaflet ESM Testing
**Learning:** `react-leaflet` v4 is ESM-only and causes syntax errors in standard Jest environments. `jest.mock` with `requireActual` fails because it tries to parse the ESM module.
**Action:** Completely mock `react-leaflet` components with simple div replacements and do not use `requireActual`.
## 2024-05-23 - DeepSource Mocking
**Learning:** `jest.mock` factories are hoisted above imports, so `require` is necessary to load modules like `react`. DeepSource flags this as a violation (`JS-C1003`).
**Action:** Use `// skipcq: JS-C1003` inside mock factories to suppress this specific warning instead of rewriting mocks unnecessarily.
## 2024-05-23 - Mock Class Linting
**Learning:** Mock classes often trigger 'empty class' or 'method not using this' linter rules.
**Action:** Use `// skipcq: JS-0323` (no this) and ensure classes have at least one constructor or member to satisfy `JS-0045`.
## 2024-05-23 - Linting Mock Classes
**Learning:** Suppressing linter warnings for empty mock classes or methods requires specific codes (e.g., `JS-0105` for missing `this`, `JS-0327` for empty class). Returning `this` in mock methods is a cleaner fix than suppression for fluent interfaces.
**Action:** Always prefer implementing minimal mock logic (like returning `this`) over suppression when possible.
## 2024-05-23 - DeepSource Correct Suppression Codes
**Learning:**
- `JS-0359`: Use this code to suppress strict mode violations for `require` statements inside `jest.mock` factories. `JS-C1003` is incorrect/deprecated for this specific linter rule.
- `JS-0019`: Use this code to suppress warnings for usage of the `any` type.
**Action:** Always verify the exact DeepSource code (e.g., from the dashboard or error message) before applying suppressions.
## 2024-05-23 - DeepSource Any Suppression
**Learning:** The correct suppression code for 'unexpected any' (`JS-0323`) differs from standard or expected codes. Always verify against specific linter output.
**Action:** Use `// skipcq: JS-0323` for suppressing usages of the `any` type when explicitly flagged.
## 2024-05-23 - Jest Mock Verification
**Learning:** When testing for 'no re-renders', always verify that the component *did* render initially (render count > 0) to avoid false positives where the component wasn't rendered at all.
**Action:** Add `expect(count).toBeGreaterThan(0)` before the action that triggers the potential re-render.
## 2024-05-23 - Component Ordering
**Learning:** React components using helper functions must have those helpers defined *before* the component definition in the file to avoid 'used before defined' linter warnings, even if function hoisting allows it at runtime.
**Action:** Move all helper functions and sub-components to the top of the file, above the main exported component.
## 2024-05-23 - React Display Name
**Learning:** Components defined via HOCs like `React.memo` or `forwardRef` lose their implicit name. Always manually set `Component.displayName = 'Component'` to ensure they are identifiable in DevTools and logs.
**Action:** Add `displayName` immediately after component definition.
## 2026-05-21 - Use asynchronous file I/O in CommonJS CLI scripts
**Learning:** For single-purpose CommonJS CLI scripts handling I/O operations (like reading large log files), wrapping the logic in an `async function main() { ... }` block and utilizing `fs.promises` instead of synchronous `fs` methods improves event loop responsiveness and adheres to idiomatic Node.js practices, even if the raw execution time improvement is minimal.
**Action:** When updating or writing CLI scripts that perform I/O operations, default to asynchronous implementations using top-level async wrappers rather than blocking synchronous methods.
## 2026-08-11 - Optimize cloneJsonValue Object Loop
**Learning:** `Object.entries()` or `Object.keys()` combined with array mapping in highly recursive functions like `cloneJsonValue` allocates unnecessary intermediate arrays, slowing down cloning logic and increasing garbage collection overhead.
**Action:** Replace `Object.entries(val).map()` with a standard `for...in` loop to iterate over object keys, strictly coupled with an `Object.prototype.hasOwnProperty.call(val, key)` guard to maintain functionality (ensuring inherited prototype properties aren't processed). This safely bypasses intermediate array allocation, boosting parsing speed.
Changelog-Impact: none
