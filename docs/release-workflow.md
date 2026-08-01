# GFC delivery architecture

This is the post-migration operating model. `main` is the reviewed catch-all
integration branch and the hosted beta is a manually released snapshot of it;
there is no beta source branch.

## Branches

| Branch | Meaning | Allowed delivery |
| --- | --- | --- |
| `main` | Next-major integration line; may contain an entire rewrite | Manual beta prerelease only |
| `stable/X.Y.x` | Current production line | Manual stable release only |
| `port/<pr>-to-main` | Reviewable forward-port of a merged stable fix | Normal PR into `main` |

`main` is never merged back into `stable/X.Y.x`. A stable line can contain
patches that are absent from main, so every merged stable PR is forward-ported
as its own reviewable PR when it applies cleanly. If the rewrite makes the
patch unsafe to apply, automation opens one `porting/conflicts` issue with the
conflicting files and a human-resolution checklist instead of creating a
conflict PR.

## Stable fixes forward-port into main

When a reviewed PR merges into a `stable/X.Y.x` branch, the
`Forward-port Stable Fix` workflow prepares a normal draft PR from the stable
merge into `main`. It applies the trusted merge commit's diff to the current
`main` branch; it never checks out or executes code from the original PR head,
and it never merges the port automatically.

If the diff applies cleanly, review the generated `port/<pr>-to-main` PR like
any other change. If the architectures have diverged, the workflow creates a
`porting/conflicts` issue instead. Re-express the stable behavior manually on
`main`, then include `Changelog-Impact: inherited` and `Port of #<stable-pr>`
when the stable changelog entry is carried forward.

## Manual delivery paths

### Hosted beta snapshot

1. Merge reviewed work into `main`.
2. Run **Create Beta Release** with `RELEASE-BETA`.
3. The prerelease event starts **Deploy Beta**.

No merge, push, or PR automatically deploys the hosted beta.

### Stable major promotion

1. Run **Prepare Main Stable Promotion**. It creates a draft PR that prepares
   the stable package version, production manifest, and release notes from a
   reviewed main commit.
2. Review and merge that PR into `main`.
3. Run **Bootstrap Stable Line** to create `stable/X.Y.x` at the exact merged
   main commit.
4. Run **Create Stable Release** from that stable line.
5. The published release event starts **Deploy Production**.

### Production hotfix

1. Branch `hotfix/...` from `stable/X.Y.x`.
2. Update `package.json`, `deploy/production-release.json`, and the stable
   hotfix changelog lane in the same PR.
3. Run **Deploy Staging** against the exact hotfix branch or commit.
4. Review the staging smoke test, then merge the stable PR.
5. Run **Create Stable Release** manually. The release event deploys it.
6. The stable merge attempts to create a draft `port/<pr>-to-main` PR. Review
   that PR separately because main may have diverged substantially. If the
   attempt conflicts, automation opens a `porting/conflicts` issue instead;
   resolve the behavior in a normal PR into `main`.

## Changelog gate

Every PR declares exactly one `Changelog-Impact` value. CI blocks the PR when
the declaration is missing or the required lane is absent:

- `beta`: `CHANGELOG.md` → `### Next major / beta`
- `hotfix`: `CHANGELOG.md` → `### Stable 1.6.x hotfixes` (replace with the active line)
- `none`: no changelog edit and a non-empty `Changelog-Reason`
- `inherited`: a port reference such as `Port of #123`

Release workflows select the matching lane when generating GitHub release
notes. Dependabot updates the lane belonging to the PR base branch.

## Migration order

1. Merge the stack in order and keep every PR reviewable.
2. Observe the new manual workflows without running them during cutover.
3. Run the main cutover rehearsal and verify staging, beta release, stable
   release, and forward-port behavior.
4. Confirm the GitHub ruleset protects `main` and `stable/**`, and remove the
   legacy `beta` branch from the ruleset target list.
5. Run the beta retirement readiness check, then delete the old `beta` branch
   manually after the rollback window. The readiness workflow never deletes it.
