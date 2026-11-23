# Security and supply-chain checks

This repository uses GitHub's default CodeQL setup and a GitHub Actions dependency-review workflow.
The default setup is configured for Actions, JavaScript/TypeScript, and Python. Keep it enabled: advanced CodeQL workflows cannot upload analyses while default setup is active.

## Pull request and scheduled checks

- GitHub's default CodeQL setup analyzes JavaScript/TypeScript, Python, and GitHub Actions code on pull requests and weekly. Manage its languages and schedule in the repository's security settings.
- `.github/workflows/dependency-review.yml` reviews dependency changes in pull requests to `main`. It blocks newly introduced vulnerabilities rated moderate or higher across runtime, development, and unknown dependency scopes.
- Dependabot continues to open weekly dependency update pull requests. Dependency review checks lockfile and manifest changes before merge. Dependabot also proposes weekly grouped minor and patch updates to GitHub Actions used by workflows; major action updates remain separate for review.
- The new security workflows pin third-party actions to reviewed commit SHAs. Dependabot keeps those pins current through pull requests.

The default CodeQL setup and dependency-review workflow publish status checks. Repository administrators can require those checks in the `main` ruleset.

## What each review service does

Treat GitHub Actions checks as the merge gate when the `main` ruleset requires them. Third-party analysis services can add useful findings, but a green result from an advisory service does not replace required CI or owner review. The exact required-check list belongs to the GitHub ruleset and can change without a repository commit.

| Service | Role | Merge authority |
| --- | --- | --- |
| CodeQL | GitHub's default setup scans Actions, JavaScript/TypeScript, and Python for code security issues on pull requests and weekly. | CI status check. Require it in the ruleset if the owner wants it to block merge. |
| Dependency review | `.github/workflows/dependency-review.yml` checks dependency changes to `main` and fails for newly introduced moderate-or-higher vulnerabilities across runtime, development, and unknown scopes. | CI status check. Require it in the ruleset for dependency changes. |
| Dependabot grouping | `.github/dependabot.yml` groups compatible minor and patch updates by ecosystem. Major versions stay separate. Urgent security updates should be reviewed as their own changes rather than hidden in a routine group. | Opens update PRs; it does not approve or merge them. Dependency review and normal CI still apply. |
| DeepSource | External static-analysis service. A result can surface code-health or defect findings; repository configuration and its hosted dashboard control which analyzers and severities run. | Advisory unless the repository explicitly marks a DeepSource status context required. The current workflow files do not configure DeepSource. |
| CodeScene | External code-health and change-risk review. Use findings to focus human review on risky or unhealthy changes. | Advisory unless the repository ruleset explicitly requires its status. The service is not configured by a workflow in this repository. |
| OCR review bot | `.github/workflows/ocr-review.yml` checks image-based content in pull requests and reports the `ocr-review` context. The workflow comments say the context is required by repository rules. | Treat as required when that ruleset is active. If the workflow cannot produce the head status, correct the check before merge rather than assuming a skipped job passed. |
| Greptile | No Greptile workflow or configuration was found in the repository at the time of this review. If the integration is enabled in GitHub, use it as a review aid and verify the integration's status requirement in the ruleset. | No repository evidence that it is required. Do not treat its absence or a green advisory comment as CI approval. |

Check the live ruleset before changing these classifications. A status visible on a pull request is not automatically a required status.

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
