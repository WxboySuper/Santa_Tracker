# Security and supply-chain checks

This repository runs CodeQL and dependency review from GitHub Actions.

## Pull request and scheduled checks

- `.github/workflows/codeql.yml` analyzes JavaScript/TypeScript and GitHub Actions workflow code on pull requests to `main`, pushes to `main`, and weekly.
- The CodeQL configuration at `.github/codeql/codeql-config.yml` excludes archived Flask code, generated content, and data files from the scan.
- `.github/workflows/dependency-review.yml` reviews dependency changes in pull requests to `main`. It blocks newly introduced vulnerabilities rated moderate or higher across runtime, development, and unknown dependency scopes.
- Dependabot continues to open weekly dependency update pull requests. Dependency review checks lockfile and manifest changes before merge. Dependabot also proposes weekly grouped minor and patch updates to GitHub Actions used by workflows; major action updates remain separate for review.

The workflow files create status checks. Repository administrators can require the CodeQL and dependency-review checks in the `main` ruleset if they should block merges.

## Secret protection

Secret scanning and push protection are enabled in the repository's GitHub security settings. These settings are managed by GitHub rather than by workflow files.

## Release source provenance

When a GitHub release is published, `.github/workflows/release-provenance.yml` creates a tar archive from the release tag, generates a GitHub artifact attestation for it, and attaches the archive to that release. The archive contains the source at the tag and excludes runner files.

Download the `*-source.tar.gz` asset from the release, then verify it with GitHub CLI:

```sh
gh attestation verify Santa_Tracker-vX.Y.Z-source.tar.gz --repo WxboySuper/Santa_Tracker
```

Replace `vX.Y.Z` with the release tag. Verification checks the artifact digest and the signed build provenance from GitHub Actions.
