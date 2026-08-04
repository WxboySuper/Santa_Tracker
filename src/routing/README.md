# Route construction

`src/routing` builds the application route table and applies feature-gated
route composition. Exposure policy belongs in `src/config` and `src/features`;
route builders should connect that policy to pages without duplicating it.

Update route and exposure tests when a page, guard, or route contract changes.
