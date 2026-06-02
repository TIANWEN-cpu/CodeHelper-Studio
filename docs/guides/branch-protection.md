# Branch Protection Rules

This document describes the recommended branch protection configuration for the CodeHelper repository.

These settings should be applied via **GitHub Settings > Branches > Branch protection rules** in the repository settings page.

---

## `main` Branch (Production)

### Settings to Enable

| Setting                              | Value                  | Rationale                            |
| ------------------------------------ | ---------------------- | ------------------------------------ |
| Require pull request before merging  | Yes                    | Prevent direct pushes to main        |
| Required approving reviews           | 1                      | Minimum code review                  |
| Dismiss stale reviews on new commits | Yes                    | Force re-review after changes        |
| Require review from code owners      | No (single maintainer) | Avoid self-review deadlock           |
| Require status checks before merging | Yes                    | Gate on CI passing                   |
| Required status checks               | See below              | Enforce quality gates                |
| Require conversation resolution      | Yes                    | All review comments must be resolved |
| Require linear history               | Yes                    | Enforce squash or rebase merges      |
| Require signed commits               | No (optional)          | Can be enabled for higher security   |
| Include administrators               | No                     | Allow maintainer emergency pushes    |
| Allow force pushes                   | No                     | Prevent history rewriting            |
| Allow deletions                      | No                     | Prevent accidental branch deletion   |

### Required Status Checks

The following CI jobs must pass before a PR can merge to `main`:

```
Lint / Format / Typecheck
Test (Node 18)
Test (Node 20)
Test (Node 22)
Bundle Size Check
PR Title Validation
```

### How to Apply

1. Go to `https://github.com/TIANWEN-cpu/CodeHelper/settings/branches`
2. Click **Add rule**
3. Branch name pattern: `main`
4. Enable all settings listed above
5. Under "Require status checks to pass before merging", search and add each required check
6. Click **Save changes**

---

## `dev` Branch (Development Integration)

### Settings to Enable

| Setting                              | Value                                         | Rationale                    |
| ------------------------------------ | --------------------------------------------- | ---------------------------- |
| Require pull request before merging  | Yes                                           | Ensure code review           |
| Required approving reviews           | 1                                             | Minimum review               |
| Require status checks before merging | Yes                                           | Gate on CI                   |
| Required status checks               | `Lint / Format / Typecheck`, `Test (Node 20)` | Lighter gates for dev speed  |
| Require linear history               | Yes                                           | Clean git history            |
| Include administrators               | No                                            | Allow fast-track when needed |

---

## Feature Branches (`feat/*`, `fix/*`, `docs/*`)

No branch protection rules needed. These branches are short-lived and merge via PR into `dev` or `main`.

---

## CI/CD Pipeline Overview

```
Feature Branch
    |
    v
PR Opened --> pr-check.yml (title, size, reviewers)
    |
    v
ci.yml (parallel):
    +-- Security Audit
    +-- Lint / Format / Typecheck
    +-- Test (Node 18 / 20 / 22)     [needs: lint]
    +-- Bundle Size Check             [needs: lint]
    +-- Build Smoke (Win/Mac/Linux)   [needs: lint]
    |
    v
Merge to main
    |
    v
Tag v*.*.* --> release.yml:
    1. Prepare (validate, changelog, test)
    2. Build (Win / Mac / Linux)      [needs: prepare]
    3. Publish GitHub Release          [needs: build]
    4. Verify Release                  [needs: publish]
```

---

## Dependabot Auto-merge (Optional)

To enable auto-merge for minor/patch dependency updates:

1. Go to `https://github.com/TIANWEN-cpu/CodeHelper/settings/branches` and ensure branch protection exists for `main`
2. Install the [Dependabot Auto-merge GitHub App](https://github.com/apps/dependabot) or create a workflow:

```yaml
# .github/workflows/dependabot-auto-merge.yml
name: Dependabot Auto-merge
on: pull_request

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    steps:
      - name: Fetch Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Auto-merge minor and patch updates
        if: steps.metadata.outputs.update-type != 'version-update:semver-major'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

3. Enable "Allow auto-merge" in repository settings (`Settings > General > Pull Requests`)

---

## Troubleshooting

### Status check names not appearing

After first CI run, status check names become available in the branch protection dropdown. If they don't appear:

1. Ensure the workflow has run at least once on a PR targeting `main`
2. Check the exact job name in the workflow YAML (the `name:` field, not the key)
3. Wait a few minutes for GitHub to index the checks

### Dependabot PRs stuck

- Verify `CODECOV_TOKEN` secret is set (if codecov checks are required)
- Check that all required status checks are passing
- If auto-merge is not working, verify "Allow auto-merge" is enabled in repo settings

### Emergency push to protected branch

Administrators can temporarily disable "Include administrators" or use a personal access token with admin scope. Remember to re-enable protection after the emergency fix.
