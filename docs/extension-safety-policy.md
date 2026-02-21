# Extension safety policy

The app scores **VS Code extensions** using a configurable policy. Higher **score** = higher risk. The policy is in `public/extension-safety-policy.json`.

## How it works

1. **Extension data** comes from the VS Code Marketplace (publisher, version, dates, rating, installs, repo link).
2. **Metadata** (including optional behaviour/supply-chain fields) is compared to the policy rules; each triggered rule adds points.
3. **Thresholds** map the total score to a **decision**: `ALLOW`, `REVIEW`, or `BLOCK`.

The same logic runs in the Worker API, in the browser (when policy is loaded), and in Node via `evaluate-extension.js`.

---

## Rule categories and weights

Default total weight is 100. Weights and thresholds are configurable in `extension-safety-policy.json`.

### 1. Publisher (default 20 pts)

| Rule | Condition | Points | Rationale |
|------|-----------|--------|-----------|
| **Publisher changed recently** | `publisherChangedDaysAgo < blockIfPublisherChangedDays` (default 90) | 20 | Recent publisher change can indicate transfer or takeover. |
| **Long dormancy detected** | `dormantMonths > blockIfDormantMonths` (default 24) | 20 | No update for a long time suggests abandonware. |

### 2. Update (default 20 pts)

| Rule | Condition | Points | Rationale |
|------|-----------|--------|-----------|
| **Recent update risk window** | `lastUpdatedDaysAgo < highRiskRecentUpdateDays` (default 7) | 10 | Very recent release may not be widely vetted. |
| **No update in 12+ months** | `dormantMonths >= flagIfDormantMonths` (default 12) | 20 | Stale extension. |
| **Major jump after dormancy** | `majorVersionJumpAfterDormancy === true` | 20 | Big version bump after long quiet period can be suspicious. |

### 3. Reputation (default 10 pts)

| Rule | Condition | Points | Rationale |
|------|-----------|--------|-----------|
| **Low install count** | `installs < minInstalls` (default 1000) | 5 | Little adoption. |
| **Low rating** | `rating < minRating` (default 3) | 5 | Poor user feedback. |

### 4. Behaviour (default 30 pts)

Requires additional metadata (not provided by Marketplace alone). If present:

| Rule | Condition | Points | Rationale |
|------|-----------|--------|-----------|
| **Obfuscated code** | `isObfuscated` | 30 | Hard to audit. |
| **Uses child_process** | `usesChildProcess` | 10 | Can run arbitrary processes. |
| **Uses eval** | `usesEval` | 10 | Dynamic code execution. |
| **Hard coded IP** | `hasHardcodedIP` | 10 | May phone home or use fixed endpoints. |
| **Downloads remote code** | `downloadsRemoteCode` | 30 | Supply-chain risk. |

### 5. Supply chain (default 20 pts)

| Rule | Condition | Points | Rationale |
|------|-----------|--------|-----------|
| **No public repository** | `requirePublicRepo` and `hasPublicRepo === false` | 20 | No visible source to audit. |
| **Recent repo transfer** | `repoTransferredDaysAgo < flagIfRepoTransferredRecentlyDays` (default 90) | 10 | Repo recently transferred. |
| **New maintainer recently added** | `newMaintainerDaysAgo < flagIfNewMaintainerDays` (default 60) | 10 | New contributor in short window. |

`hasPublicRepo` is set from the extension’s Marketplace “Repository” link when it points to a known public host (e.g. GitHub, GitLab). Other supply-chain fields require external data.

---

## Thresholds

- **review** (default 20): Score ≥ this → decision `REVIEW`.
- **block** (default 45): Score ≥ this → decision `BLOCK`.
- Below **review** → decision `ALLOW`.

---

## Policy file shape

`public/extension-safety-policy.json`:

- **version**: Optional string (e.g. `"1.0"`).
- **weights**: `publisher`, `update`, `reputation`, `behaviour`, `supplyChain` (numbers).
- **thresholds**: `review`, `block` (numbers).
- **rules**: Nested objects per category with the parameters above (e.g. `blockIfPublisherChangedDays`, `minInstalls`, `requirePublicRepo`).

The Worker (`src/api/fetch-extensions.js`) loads this file from the same origin (`GET /extension-safety-policy.json`) when handling `POST /api/fetch-extensions`. The browser loads it for the in-page risk breakdown. The Node evaluator `lib/evaluate-extension.js` reads it from disk when run as a script or from tests.
