## 2026-08-11 - Regex CSV split optimization
**Learning:** Using regex for splitting CSV lines while preserving quoted strings, coupled with a fast path check (`!line.includes('"')`), is significantly faster than manually accumulating strings in V8 (approx 20x speedup for 100k char fields) as it avoids excessive memory allocations during string concatenation.
**Action:** Use regex splits with fast paths for CSV parsing instead of character-by-character loops when performance is critical.
