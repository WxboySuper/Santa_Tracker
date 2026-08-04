# Client metrics

`src/metrics` owns client-side metrics hooks and their tests. Metrics are
observability helpers, not a source of product state or authorization.

Keep collection optional and privacy-conscious. Update the metrics tests when
event names, payloads, or lifecycle behavior change.
