## Main next-major cutover

This PR intentionally makes `main` the next-major integration line from the
current `beta` source. It is not a production deployment and must not delete
the stable production branch.

### Before merge

- [ ] A versioned stable branch (for example `stable/1.6.x`) exists and is protected
- [ ] Production hotfixes have been forward-ported to `main` or marked not applicable with a reason
- [ ] Workflow conflicts preserve manual release, stable-line deployment, and stable-to-main porting
- [ ] CI and reviews are green
- [ ] Staging rehearsal completed from the intended next-major source

### Changelog decision

Changelog-Impact: beta

### Feature exposure

- [ ] Exposure report generated and reviewed
- [ ] Newly production-visible features are explicitly listed in this PR
- [ ] No beta-only or experimental features are accidentally exposed in production

### After merge

- [ ] Keep `beta` read-only during the observation window
- [ ] Use the manual beta release workflow for hosted beta snapshots
- [ ] Delete or archive `beta` only after the cutover smoke test and rollback window
