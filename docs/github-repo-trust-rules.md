# GitHub repo trustworthiness rules

The app scores **public GitHub repositories** linked to VS Code extensions using a separate policy from extension trust. The policy is in `public/github-repo-safety-policy.json`. Higher **score** = higher risk.

## How it works

1. **Repo data** is fetched from the GitHub API (stars, forks, open issues, PRs, age, last push, contributor count).
2. **Metadata** is compared to the policy rules; each triggered rule adds points to the score.
3. **Thresholds** map the total score to a **decision**: `ALLOW`, `REVIEW`, or `BLOCK`.

Same pattern as extension safety: configurable weights, thresholds, and rule parameters in JSON.

---

## Rule categories and weights

Default total weight is 100, split across four categories (25 each). You can change weights and thresholds in `github-repo-safety-policy.json`.

### 1. Engagement (default 25 pts)

Measures community adoption.

| Rule | Condition | Points | Rationale |
|------|-----------|--------|-----------|
| **Low star count** | `stars < minStars` (default 10) | 12.5 | Very few stars suggests little visibility or trust. |
| **No or very few forks** | `forks < minForks` (default 1) | 12.5 | No forks can mean no one is building on or vetting the code. |

### 2. Health (default 25 pts)

Measures issue hygiene and maintenance.

| Rule | Condition | Points | Rationale |
|------|-----------|--------|-----------|
| **High open issue count** | `openIssues > maxOpenIssues` (default 50) | 12.5 | Many open issues may indicate unmaintained or overwhelmed project. |
| **High open-issues-to-stars ratio** | `openIssues / stars > openIssuesToStarsRatio` (default 2) | 12.5 | Lots of issues relative to interest can signal abandonware or quality problems. |

### 3. Freshness (default 25 pts)

Measures how active the repo is over time.

| Rule | Condition | Points | Rationale |
|------|-----------|--------|-----------|
| **Repo very new** | `ageDays < minRepoAgeDays` (default 90) | 12.5 | New repos have no track record. |
| **Repo dormant** | `daysSincePush > maxDaysSincePush` (default 365) | 12.5 | No push in a long time suggests the project is inactive. |

### 4. Maintainers (default 25 pts)

Measures bus factor and maintainer diversity.

| Rule | Condition | Points | Rationale |
|------|-----------|--------|-----------|
| **No contributors listed** | `contributorCount < minContributors` (default 1) | 25 | No visible contributors is a single-point-of-failure risk. |
| **Solo maintainer** | `contributorCount === 1` | 12.5 | One maintainer increases takeover or abandonment risk. |

---

## Thresholds

- **review** (default 20): Score ≥ this → decision `REVIEW`.
- **block** (default 45): Score ≥ this → decision `BLOCK`.
- Below **review** → decision `ALLOW`.

---

## Policy file shape

`public/github-repo-safety-policy.json`:

- **weights**: `engagement`, `health`, `freshness`, `maintainers` (numbers).
- **thresholds**: `review`, `block` (numbers).
- **rules**: Nested objects per category with the parameters above (e.g. `minStars`, `maxOpenIssues`, `minRepoAgeDays`). Set a rule’s `flagIf...` to `false` to disable that rule.

Repo data is fetched only for **GitHub** URLs. The extension’s `repoUrl` (from the Marketplace) is used to call `POST /api/github-repo` and get `repo` + `repoTrust`. The Worker uses `src/api/github-repo.js` and `src/api/evaluate-repo.js`; tests use `lib/evaluate-repo-extension.js`.
