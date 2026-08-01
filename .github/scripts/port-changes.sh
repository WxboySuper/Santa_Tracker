#!/usr/bin/env bash
set -euo pipefail

# Legacy helper for the stable-line → main forward-port path.
# Main is never copied back to stable because it can contain unreleased work.

echo "Merged ${SOURCE_BRANCH} into ${BASE_BRANCH}. Evaluating port targets..."

append_summary() {
  echo "$1" >> "${GITHUB_STEP_SUMMARY}"
}

append_summary "## PR porting — #${PR_NUMBER}"
append_summary ""
append_summary "Source: \`${SOURCE_BRANCH}\` → \`${BASE_BRANCH}\`"
append_summary ""

REPO_OWNER="${REPO%%/*}"
WORK_DIR="${RUNNER_TEMP:-/tmp}/gfc-port-${GITHUB_RUN_ID:-$$}"
mkdir -p "${WORK_DIR}"

PR_LABELS="$(gh pr view "${PR_NUMBER}" --repo "${REPO}" --json labels -q '.labels[].name' 2>/dev/null | paste -sd, - || true)"
OPEN_PORT_PRS_JSON="$(gh pr list --repo "${REPO}" --base main --state open \
  --json number,headRefName,title,body,url 2>/dev/null || echo '[]')"

export BASE_BRANCH SOURCE_BRANCH PR_NUMBER PR_LABELS OPEN_PORT_PRS_JSON
PORT_DECISION="$(node scripts/porting-decision.mjs)"
SKIP_PORTING="$(echo "${PORT_DECISION}" | jq -r '.skip')"
SKIP_REASON="$(echo "${PORT_DECISION}" | jq -r '.skipReason // empty')"
MANUAL_PR_NUMBER="$(echo "${PORT_DECISION}" | jq -r '.manualPr.number // empty')"
MANUAL_PR_URL="$(echo "${PORT_DECISION}" | jq -r '.manualPr.url // empty')"

mapfile -t TARGETS < <(echo "${PORT_DECISION}" | jq -r '.targets[]?')

if [[ "${SKIP_PORTING}" == "true" ]]; then
  echo "Skipping automated porting: ${SKIP_REASON}"
  append_summary "### Result: skipped"
  append_summary "${SKIP_REASON}"
  if [[ -n "${MANUAL_PR_URL}" ]]; then
    append_summary ""
    append_summary "Manual port PR: ${MANUAL_PR_URL}"
    gh pr comment "${PR_NUMBER}" --repo "${REPO}" --body "$(cat <<EOF
Automated porting skipped: ${SKIP_REASON}

Use the existing manual port PR: ${MANUAL_PR_URL}
EOF
)" || true
  else
    gh pr comment "${PR_NUMBER}" --repo "${REPO}" --body "Automated porting skipped: ${SKIP_REASON}" || true
  fi
  exit 0
fi

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  if [[ "${BASE_BRANCH}" == "main" ]]; then
    echo "No forward-port targets for ${SOURCE_BRANCH} → main."
    append_summary "_No automated forward-port target for this merge._"
  else
    echo "No port targets for merge into ${BASE_BRANCH}."
    append_summary "_No automated port targets for this merge._"
  fi
  exit 0
fi

git fetch origin pull/"${PR_NUMBER}"/head:refs/remotes/origin/pr/"${PR_NUMBER}"
gh api repos/"${REPO}"/pulls/"${PR_NUMBER}"/commits --paginate > "${WORK_DIR}/pr-commits.json"
mapfile -t PR_COMMIT_SHAS < <(jq -r '.[].sha' "${WORK_DIR}/pr-commits.json")

if [[ ${#PR_COMMIT_SHAS[@]} -eq 0 ]]; then
  echo "::error title=Porting aborted::No source PR commits found for #${PR_NUMBER}."
  append_summary "### Result: failed"
  append_summary "No source PR commits were found."
  exit 1
fi

ATTENTION_COUNT=0
HARD_FAILURES=()
CONFLICT_PR_URLS=()
PRESERVED_PORT_BRANCHES=()
SUCCESS_COUNT=0
SKIPPED_COUNT=0

record_preserved_port_branch() {
  local target="$1"
  local port_branch="$2"
  PRESERVED_PORT_BRANCHES+=("${target}|${port_branch}|$(compare_url_for_port_branch "${target}" "${port_branch}")")
}

compare_url_for_port_branch() {
  local target="$1"
  local port_branch="$2"
  echo "https://github.com/${REPO}/compare/${target}...${port_branch}?expand=1"
}

mark_port_pr_draft() {
  local pr_num="$1"
  gh pr ready "${pr_num}" --repo "${REPO}" --undo 2>/dev/null || \
    gh api repos/"${REPO}"/pulls/"${pr_num}" -X PATCH -f draft=true >/dev/null 2>&1 || true
}

find_open_port_pr() {
  local port_branch="$1"
  local target="$2"
  gh pr list --repo "${REPO}" --head "${REPO_OWNER}:${port_branch}" --base "${target}" --state open \
    --json number,url --jq '.[0] // empty | [.number, .url] | @tsv' 2>/dev/null || true
}

has_unmerged_conflicts() {
  [[ -n "$(git diff --name-only --diff-filter=U)" ]]
}

try_auto_resolve_forward_port_conflicts() {
  mapfile -t conflict_paths < <(git diff --name-only --diff-filter=U)
  if [[ ${#conflict_paths[@]} -eq 0 ]]; then
    return 1
  fi

  local classification can_auto
  classification="$(node scripts/classify-port-conflicts.mjs "${conflict_paths[@]}")"
  can_auto="$(echo "${classification}" | jq -r '.canAutoResolveAll')"

  if [[ "${can_auto}" != "true" ]]; then
    return 1
  fi

  mapfile -t auto_paths < <(echo "${classification}" | jq -r '.autoResolvable[]')
  for path in "${auto_paths[@]}"; do
    git checkout --ours -- "${path}"
    git add -- "${path}"
  done

  if git diff --name-only --diff-filter=U | grep -q .; then
    return 1
  fi

  if git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null 2>&1; then
    GIT_EDITOR=true git -c core.hooksPath=/dev/null cherry-pick --continue
    return $?
  fi

  if [[ -f .git/MERGE_HEAD ]]; then
    git -c core.hooksPath=/dev/null commit --no-edit
    return $?
  fi

  return 1
}

create_or_update_conflict_pr() {
  local target="$1"
  local port_branch="$2"
  local conflict_files="$3"
  local port_method="$4"

  git push --force-with-lease origin "${port_branch}"

  local body
  body="$(cat <<EOF
## Automated port needs conflict resolution

This **draft** PR was opened because the porting workflow could not apply the changes cleanly onto \`${target}\`.

| | |
| --- | --- |
| Original PR | #${PR_NUMBER} — ${PR_TITLE} |
| Source branch | \`${SOURCE_BRANCH}\` (merged into \`${BASE_BRANCH}\`) |
| Port method attempted | ${port_method} |

### Conflicted files

${conflict_files}

### What to do

1. Open this draft PR and edit the conflicted files (GitHub UI or local checkout of \`${port_branch}\`).
2. Remove conflict markers. For \`pnpm-lock.yaml\` / \`package-lock.json\` conflicts, prefer checking out this branch locally, aligning \`package.json\` with #${PR_NUMBER}, then running \`pnpm install\` and committing the regenerated lockfile.
3. Mark this PR **ready for review**, then merge when CI passes.

The branch intentionally contains unresolved conflict markers so you are not left rebuilding the port from scratch.

Keeping this branch current avoids \`${target}\` drifting behind \`${BASE_BRANCH}\`.
EOF
)"

  local pr_url=""
  local existing_pr
  existing_pr="$(find_open_port_pr "${port_branch}" "${target}")"

  if [[ -n "${existing_pr}" ]]; then
    local pr_num="${existing_pr%%$'\t'*}"
    pr_url="${existing_pr#*$'\t'}"
    if [[ -n "${pr_num}" && "${pr_num}" =~ ^[0-9]+$ ]]; then
      gh pr edit "${pr_num}" --repo "${REPO}" --body "${body}" || true
      mark_port_pr_draft "${pr_num}"
      gh pr comment "${pr_num}" --repo "${REPO}" --body "Port branch updated after a new merge into \`${BASE_BRANCH}\`. Please re-check conflict resolution." || true
      echo "Updated existing draft port PR #${pr_num} for ${target}"
    else
      existing_pr=""
    fi
  fi

  if [[ -z "${pr_url}" ]]; then
    gh label create "porting/conflicts" --repo "${REPO}" --color "B60205" --description "Automated port PR that needs manual conflict resolution" 2>/dev/null || true
    local create_output=""
    if create_output="$(gh pr create --repo "${REPO}" \
      --head "${port_branch}" \
      --base "${target}" \
      --draft \
      --title "[Port][Conflicts] ${PR_TITLE} → ${target}" \
      --body "${body}" \
      --label "porting/conflicts" 2>&1)"; then
      pr_url="${create_output}"
    else
      echo "::warning title=Draft port PR create failed::${create_output}"
      if create_output="$(gh pr create --repo "${REPO}" \
        --head "${port_branch}" \
        --base "${target}" \
        --title "[Port][Conflicts] ${PR_TITLE} → ${target}" \
        --body "${body}" \
        --label "porting/conflicts" 2>&1)"; then
        pr_url="${create_output}"
        local created_num
        created_num="$(gh pr list --repo "${REPO}" --head "${REPO_OWNER}:${port_branch}" --base "${target}" --state open --json number -q '.[0].number' 2>/dev/null || true)"
        if [[ -n "${created_num}" && "${created_num}" =~ ^[0-9]+$ ]]; then
          mark_port_pr_draft "${created_num}"
        fi
      else
        pr_url="$(compare_url_for_port_branch "${target}" "${port_branch}")"
        echo "::warning title=Port PR not created::${create_output} — open manually: ${pr_url}"
        HARD_FAILURES+=("${target}")
        record_preserved_port_branch "${target}" "${port_branch}"
        return 1
      fi
    fi
    echo "Opened draft conflict port PR for ${target}: ${pr_url}"
  fi

  if [[ -z "${pr_url}" ]]; then
    pr_url="$(compare_url_for_port_branch "${target}" "${port_branch}")"
  fi

  CONFLICT_PR_URLS+=("${target}|${pr_url}|${conflict_files}")
  record_preserved_port_branch "${target}" "${port_branch}"
  ATTENTION_COUNT=$((ATTENTION_COUNT + 1))
  echo "::warning title=Port conflicts::#${PR_NUMBER} → ${target} needs conflict resolution. Draft PR: ${pr_url}"
  return 0
}

commit_conflict_wip() {
  local target="$1"
  local port_branch="$2"
  local port_method="$3"

  mapfile -t conflict_paths < <(git diff --name-only --diff-filter=U)
  local conflict_files="- _(none detected)_"
  if [[ ${#conflict_paths[@]} -gt 0 ]]; then
    conflict_files=""
    for f in "${conflict_paths[@]}"; do
      conflict_files+=$'\n'"- \`${f}\`"
    done
  fi

  if [[ ${#conflict_paths[@]} -gt 0 ]]; then
    git add "${conflict_paths[@]}"
  fi
  git add -u

  if ! git -c core.hooksPath=/dev/null commit --no-verify -m "chore(port): WIP — resolve conflicts porting #${PR_NUMBER} to ${target}

Automated port from ${SOURCE_BRANCH} (merged to ${BASE_BRANCH}).
Resolve conflict markers in the files below, then mark the draft PR ready for review.

Port method attempted: ${port_method}
Conflicted paths:
$(printf '%s\n' "${conflict_paths[@]}")"; then
    echo "::error title=Port conflicts not committed::Could not commit conflict state for ${target}."
    HARD_FAILURES+=("${target}")
    return 1
  fi

  create_or_update_conflict_pr "${target}" "${port_branch}" "${conflict_files}" "${port_method}"
}

reset_port_branch() {
  local target="$1"
  local port_branch="$2"
  git cherry-pick --abort 2>/dev/null || true
  git merge --abort 2>/dev/null || true
  git checkout -B "${port_branch}" "origin/${target}"
}

handle_port_conflicts() {
  local target="$1"
  local port_branch="$2"
  local port_method="$3"

  echo "Unresolved conflicts remain for ${target}; publishing draft port PR."
  commit_conflict_wip "${target}" "${port_branch}" "${port_method}" || true
  PORTED=false
  return 0
}

for TARGET in "${TARGETS[@]}"; do
  echo "--- Attempting to port to ${TARGET} ---"

  PORT_BRANCH="port/${PR_NUMBER}-to-${TARGET//\//-}"
  PORTED=false
  PORT_METHOD="cherry-pick"

  if ! git ls-remote --exit-code --heads origin "${TARGET}" > /dev/null; then
    echo "Branch ${TARGET} no longer exists. Skipping."
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  git fetch origin "${TARGET}"
  git checkout -B "${PORT_BRANCH}" "origin/${TARGET}"

  COMMITS_TO_PICK=()
  for SHA in "${PR_COMMIT_SHAS[@]}"; do
    if git merge-base --is-ancestor "${SHA}" "origin/${TARGET}"; then
      echo "Commit ${SHA} already exists on ${TARGET}. Skipping it."
      continue
    fi
    COMMITS_TO_PICK+=("${SHA}")
  done

  if [[ ${#COMMITS_TO_PICK[@]} -eq 0 ]]; then
    echo "No source PR commits need porting to ${TARGET}. Skipping."
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    git checkout "${BASE_BRANCH}"
    git branch -D "${PORT_BRANCH}" || true
    continue
  fi

  if git cherry-pick "${COMMITS_TO_PICK[@]}"; then
    PORTED=true
  elif has_unmerged_conflicts; then
    PORT_METHOD="cherry-pick (conflicts)"
    handle_port_conflicts "${TARGET}" "${PORT_BRANCH}" "${PORT_METHOD}"
  else
    echo "Cherry-pick failed for ${TARGET} without index conflicts; trying merge fallback."
    reset_port_branch "${TARGET}" "${PORT_BRANCH}"

    PORT_METHOD="merge (PR head)"
    MERGE_MSG="Port PR #${PR_NUMBER} (${SOURCE_BRANCH}) into ${TARGET}"
    if git merge --no-ff -m "${MERGE_MSG}" "origin/pr/${PR_NUMBER}"; then
      PORTED=true
    elif has_unmerged_conflicts; then
      handle_port_conflicts "${TARGET}" "${PORT_BRANCH}" "${PORT_METHOD}"
    else
      echo "::error title=Port failed::Cherry-pick and merge both failed for ${TARGET} without resolvable conflict state."
      HARD_FAILURES+=("${TARGET}")
      git checkout "${BASE_BRANCH}"
      git branch -D "${PORT_BRANCH}" || true
      continue
    fi
  fi

  if [[ "${PORTED}" != "true" ]]; then
    git checkout "${BASE_BRANCH}"
    git branch -D "${PORT_BRANCH}" || true
    continue
  fi

  git push --force-with-lease origin "${PORT_BRANCH}"

  PR_BODY="Automated port of the original commits from PR #${PR_NUMBER} into \`${TARGET}\` after merge into \`${BASE_BRANCH}\`."
  if [[ "${PORT_METHOD}" != "cherry-pick" ]]; then
    PR_BODY="${PR_BODY}

> Note: Changes were applied via **${PORT_METHOD}**."
  fi

  if ! gh pr create --repo "${REPO}" \
    --head "${PORT_BRANCH}" \
    --base "${TARGET}" \
    --title "[Port] ${PR_TITLE} to ${TARGET}" \
    --body "${PR_BODY}"; then
    echo "::warning title=Port PR not created::Could not open a port PR for ${TARGET}. Remote branch ${PORT_BRANCH} was kept for manual fallback."
    record_preserved_port_branch "${TARGET}" "${PORT_BRANCH}"
    HARD_FAILURES+=("${TARGET}")
  else
    echo "Successfully created port PR for ${TARGET} using ${PORT_BRANCH}"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  fi

  git checkout "${BASE_BRANCH}"
  git branch -D "${PORT_BRANCH}" || true
done

if [[ "${SOURCE_BRANCH}" != "main" ]]; then
  echo "--- Cleaning up original source branch ${SOURCE_BRANCH} ---"
  if git ls-remote --exit-code --heads origin "${SOURCE_BRANCH}" > /dev/null; then
    gh api -X DELETE repos/"${REPO}"/git/refs/heads/"${SOURCE_BRANCH}" || echo "Note: Source branch ${SOURCE_BRANCH} was already deleted or is protected."
  else
    echo "Source branch ${SOURCE_BRANCH} already removed from origin."
  fi
fi

append_summary "### Summary"
append_summary "- Successful port PRs: **${SUCCESS_COUNT}**"
append_summary "- Skipped (already synced / missing branch): **${SKIPPED_COUNT}**"
append_summary "- Draft conflict PRs opened: **${ATTENTION_COUNT}**"
append_summary "- Hard failures: **${#HARD_FAILURES[@]}**"
append_summary ""

if [[ ${#HARD_FAILURES[@]} -gt 0 ]]; then
  append_summary "### Hard failures"
  append_summary ""
  for f in "${HARD_FAILURES[@]}"; do
    append_summary "- \`${f}\`"
  done
  append_summary ""
fi

if [[ ${ATTENTION_COUNT} -gt 0 ]]; then
  append_summary "### Draft conflict PRs"
  append_summary ""
  append_summary "| Target | Draft PR |"
  append_summary "| --- | --- |"
  for entry in "${CONFLICT_PR_URLS[@]}"; do
    IFS='|' read -r t url _ <<< "${entry}"
    append_summary "| \`${t}\` | [open draft PR](${url}) |"
  done
  append_summary ""
fi

if [[ ${#PRESERVED_PORT_BRANCHES[@]} -gt 0 ]]; then
  append_summary "### Fallback port branches (kept on origin)"
  append_summary ""
  append_summary "| Target | Branch | Open PR from branch |"
  append_summary "| --- | --- | --- |"
  for entry in "${PRESERVED_PORT_BRANCHES[@]}"; do
    IFS='|' read -r t branch url <<< "${entry}"
    append_summary "| \`${t}\` | \`${branch}\` | [compare & open PR](${url}) |"
  done
  append_summary ""
fi

if [[ ${ATTENTION_COUNT} -gt 0 ]]; then
  NOTICE_COMMENT="$(cat <<EOF
### Automated porting opened draft conflict PR(s)

PR #${PR_NUMBER} was merged into \`${BASE_BRANCH}\`. **${ATTENTION_COUNT}** target(s) need manual conflict resolution.

EOF
)"
  for entry in "${CONFLICT_PR_URLS[@]}"; do
    IFS='|' read -r t url _ <<< "${entry}"
    NOTICE_COMMENT+="- \`${t}\`: ${url}\n"
  done
  NOTICE_COMMENT+="\nWorkflow summary: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  gh pr comment "${PR_NUMBER}" --repo "${REPO}" --body "$(echo -e "${NOTICE_COMMENT}")" || true
fi

if [[ ${#HARD_FAILURES[@]} -gt 0 ]]; then
  for f in "${HARD_FAILURES[@]}"; do
    echo "::error title=Port failed::${f} — see workflow log"
  done
  exit 1
fi

if [[ ${SUCCESS_COUNT} -eq 0 && ${ATTENTION_COUNT} -eq 0 && ${SKIPPED_COUNT} -eq 0 ]]; then
  append_summary "No port work was performed."
fi

if [[ ${SUCCESS_COUNT} -gt 0 || ${ATTENTION_COUNT} -gt 0 || ${SKIPPED_COUNT} -gt 0 ]]; then
  append_summary "Porting completed."
fi

echo "Porting completed."
exit 0
