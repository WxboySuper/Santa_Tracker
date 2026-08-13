## 2025-02-20 - Optimize Redux forecastSlice array operations
**Learning:** Multiple array operations (`Object.entries`, `filter`, `map`, `includes`) inside high-frequency Redux reducers are algorithmically inefficient (O(N^2)) and create unnecessary garbage collection pressure.
**Action:** Replace multi-pass array logic with direct key lookups into source objects to achieve O(1) checks and a single O(N) array allocation, reducing execution time by ~36% as measured via Node.js perf_hooks.
