# Security and supply-chain checks

This repository uses GitHub's default CodeQL setup and a GitHub Actions dependency-review workflow.
The default setup is configured for Actions, JavaScript/TypeScript, and Python. Keep it enabled: advanced CodeQL workflows cannot upload analyses while default setup is active.

## Pull request and scheduled checks

- GitHub's default CodeQL setup analyzes JavaScript/TypeScript, Python, and GitHub Actions code on pull requests and weekly. Manage its languages and schedule in the repository's security settings.
- `.github/workflows/dependency-review.yml` reviews dependency changes in pull requests to `main`. It blocks newly introduced vulnerabilities rated moderate or higher across runtime, development, and unknown dependency scopes.
- Dependabot continues to open weekly dependency update pull requests. Dependency review checks lockfile and manifest changes before merge. Dependabot also proposes weekly grouped minor and patch updates to GitHub Actions used by workflows; major action updates remain separate for review.
- The new security workflows pin third-party actions to reviewed commit SHAs. Dependabot keeps those pins current through pull requests.

The default CodeQL setup and dependency-review workflow publish status checks. Repository administrators can require those checks in the `main` ruleset.

## Secret protection

Secret scanning and push protection are enabled in the repository's GitHub security settings. These settings are managed by GitHub rather than by workflow files.

## Release source provenance

When a GitHub release is published, `.github/workflows/release-provenance.yml` creates a tar archive from the release tag, generates a GitHub artifact attestation for it, and attaches the archive to that release. The archive contains the source at the tag and excludes runner files.

Download the `*-source.tar.gz` asset from the release, then verify it with GitHub CLI:

```sh
gh attestation verify Santa_Tracker-vX.Y.Z-source.tar.gz --repo WxboySuper/Santa_Tracker
```

Replace `vX.Y.Z` with the release tag. Verification checks the artifact digest and the signed build provenance from GitHub Actions.

The workflow does not overwrite an existing release asset. To retry after a partial upload, list the assets with `gh release view <tag> --json assets --jq '.assets[].name'`, then remove the existing source archive with `gh release delete-asset <tag> <asset-name>` and rerun the workflow. It recreates the archive from the same release tag before attesting and uploading it.
