# Extension details and trust API

This API returns **details** (from the VS Code Marketplace) and **trust** (risk score and decision from the extension safety policy) for a list of extensions. You can call it from scripts, CI, or other apps.

## Contents

1. [POST /api/fetch-extensions](#endpoint) – Extension details and trust
2. [Request](#request) – Headers, body, limits
3. [Response](#response) – Success and error
4. [Examples](#examples) – cURL, PowerShell, fetch
5. [Batching](#batching-for-long-lists) – Long extension lists
6. [POST /api/github-repo](#github-repo-data-and-trust) – GitHub repo data and repo trust

---

## Endpoint

```
POST /api/fetch-extensions
```

**Base URL:** Your deployment URL (e.g. `https://everyminute.<your-subdomain>.workers.dev`).

**Request body:** JSON with an array of extension IDs in `publisher.extension` format.

**Response:** JSON with a `results` array; each item has Marketplace fields plus trust fields when the policy is available.

---

## Request

### Headers

| Header            | Value                |
|-------------------|----------------------|
| `Content-Type`    | `application/json`   |

### Body

```json
{
  "extensions": [
    "ms-python.python",
    "esbenp.prettier-vscode"
  ]
}
```

- **`extensions`** (required): array of strings. Each string is one extension ID (`publisher.extension`). Duplicates are allowed; order is preserved.
- **Limit:** Up to **24** extension IDs per request (each extension may use 2 subrequests: Marketplace query + optional manifest fetch for repo URL; plus 1 for policy = 50 subrequest limit). For longer lists, call the API multiple times in batches and merge the `results` arrays. The web UI does this automatically.

---

## Response

### Success (200)

```json
{
  "results": [
    {
      "extensionId": "ms-python.python",
      "error": "",
      "publisher": "ms-python",
      "extensionName": "python",
      "currentVersion": "2024.20.0",
      "lastVersion": "2024.20.0",
      "lastVersionUpdateDate": "2024-10-15",
      "rating": "4.82",
      "ratingCount": "28491",
      "installCount": "89000000",
      "publisherVerified": true,
      "riskScore": 10,
      "riskDecision": "ALLOW",
      "triggeredRules": ["No update in 12+ months"],
      "riskBreakdown": [
        { "rule": "No update in 12+ months", "points": 20 }
      ]
    }
  ]
}
```

**Details (Marketplace):**

| Field                    | Type    | Description |
|--------------------------|---------|-------------|
| `extensionId`            | string  | Requested ID (`publisher.extension`). |
| `error`                  | string  | Empty if found; otherwise e.g. `"Not found"`, `"HTTP 404"`. |
| `publisher`              | string  | Publisher identifier. |
| `extensionName`          | string  | Extension name. |
| `currentVersion`         | string  | Latest version. |
| `lastVersion`            | string  | Same as current. |
| `lastVersionUpdateDate`  | string  | Date of last update (YYYY-MM-DD). |
| `rating`                 | string  | Average rating (numeric string). |
| `ratingCount`            | string  | Number of ratings/reviews. |
| `installCount`           | string  | Install count. |
| `publisherVerified`      | boolean | Whether the publisher is verified. |
| `hasPublicRepo`         | boolean | Whether a known public repo URL is linked. |
| `repoUrl`               | string (optional) | Repository URL when present (use with `POST /api/github-repo` for repo data and trust). |

**Trust (safety policy):**

| Field            | Type    | Description |
|------------------|---------|-------------|
| `riskScore`      | number  | Sum of rule points (higher = riskier). |
| `riskDecision`   | string  | `"ALLOW"`, `"REVIEW"`, or `"BLOCK"` from policy thresholds. |
| `triggeredRules`  | string[]| Human-readable rule names that contributed to the score. |
| `riskBreakdown`   | array   | `{ rule, points }` for each triggered rule. |

Trust fields are present when the server can load the policy (e.g. `extension-safety-policy.json`). If the policy is unavailable, those fields are still added with safe defaults (e.g. score `0`, decision `"ALLOW"`).

### Error (4xx / 5xx)

Body is JSON with an `error` message:

```json
{
  "error": "Missing or empty \"extensions\" array"
}
```

| Status | Meaning |
|--------|---------|
| 400    | Bad request: missing/invalid body, no extension IDs, or more than 24 IDs per request. |
| 500    | Server error (e.g. Marketplace timeout, or “Too many subrequests” if the batch is too large). |

---

## Examples

### cURL

```bash
curl -X POST "https://everyminute.<your-subdomain>.workers.dev/api/fetch-extensions" \
  -H "Content-Type: application/json" \
  -d '{"extensions":["ms-python.python","esbenp.prettier-vscode"]}'
```

### PowerShell

```powershell
$body = @{ extensions = @("ms-python.python", "esbenp.prettier-vscode") } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://everyminute.<your-subdomain>.workers.dev/api/fetch-extensions" -Body $body -ContentType "application/json"
```

### JavaScript (fetch)

```javascript
const res = await fetch('https://everyminute.<your-subdomain>.workers.dev/api/fetch-extensions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    extensions: ['ms-python.python', 'esbenp.prettier-vscode'],
  }),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error || res.status);
console.log(data.results);
```

### Using trust in automation

- **`riskDecision === "BLOCK"`** – Policy suggests blocking (e.g. do not auto-install).
- **`riskDecision === "REVIEW"`** – Manual review recommended.
- **`riskScore`** – Use for sorting or custom thresholds; `triggeredRules` / `riskBreakdown` explain why.

The policy (weights and thresholds) is defined in `extension-safety-policy.json` on the same host; you can fetch it from `GET /extension-safety-policy.json` if you need the exact rules and thresholds.

---

## Batching for long lists

Cloudflare Workers have a **subrequest limit** (50 on the free tier). Each extension can use up to 2 subrequests (query + optional manifest for repo URL), plus 1 for the policy, so the API accepts at most **24 extensions per request**. For 100+ extensions:

1. Split your list into chunks of 24 (or fewer).
2. Call `POST /api/fetch-extensions` once per chunk with `{ "extensions": chunk }`.
3. Concatenate the `results` arrays in order to get one combined list.

---

## GitHub repo data and trust

For extensions that link to a **public GitHub repo**, you can fetch repo metadata and a **repo trust score** (separate from extension trust). Repo data comes from the **GitHub API** (not the Marketplace).

### Endpoint

```
POST /api/github-repo
```

**Body:** JSON with the repo URL (from the extension’s Marketplace “Repository” link, or from `repoUrl` in fetch-extensions results when present).

```json
{
  "repoUrl": "https://github.com/owner/repo"
}
```

**Response:** JSON with `repo` (metadata) and `repoTrust` (score and decision from `github-repo-safety-policy.json`).

### Repo data returned

| Field               | Type    | Description |
|---------------------|---------|--------------|
| `owner`, `repo`     | string  | Repository owner and name. |
| `url`               | string  | GitHub repo URL. |
| `stars`             | number  | Star count. |
| `forks`             | number  | Fork count. |
| `openIssues`        | number  | Open issues count. |
| `openPullRequests`  | number  | Open PRs (or `null` if unavailable). |
| `createdAt`, `updatedAt`, `pushedAt` | string (ISO) or null | Repo and last-push timestamps. |
| `ageDays`           | number  | Repo age in days. |
| `daysSincePush`     | number  | Days since last push. |
| `contributorCount`  | number or null | Number of contributors. |
| `defaultBranch`     | string  | Default branch. |
| `hasIssuesEnabled`  | boolean | Whether issues are enabled. |
| `language`, `description` | string or null | From GitHub. |

### Repo trust

When the server loads `github-repo-safety-policy.json`, the response includes `repoTrust`:

- **`score`** – Risk score (higher = riskier).
- **`decision`** – `"ALLOW"`, `"REVIEW"`, or `"BLOCK"` from policy thresholds.
- **`triggeredRules`** – Rule names that contributed.
- **`triggeredWithPoints`** – `{ rule, points }` per rule.

**Rate limits:** The GitHub API allows 60 requests/hour unauthenticated. For higher limits, set `GITHUB_TOKEN` in the Worker environment (e.g. via `wrangler secret put GITHUB_TOKEN` or in `.dev.vars` for local dev). See [Configuration](configuration.md#environment-variables--secrets).

### Errors (github-repo)

| Status | Body | Meaning |
|--------|------|---------|
| 400 | `{ "error": "Missing \"repoUrl\" or \"url\" in body" }` | Request body missing or invalid. |
| 400 | `{ "error": "Invalid or non-GitHub repo URL" }` | URL could not be parsed as a GitHub repo. |
| 400 | `{ "error": "Repository not found" }` | GitHub returned 404. |
| 400 | `{ "error": "GitHub API limit exceeded (N remaining)" }` | Rate limit hit (when no token or token exhausted). |
| 400 | `{ "error": "GitHub API error: N" }` | Other GitHub API error (e.g. 500). |

On error, the response is JSON with a single `error` string. On success, `repo` is always present; `repoTrust` is present when the repo policy could be loaded.

### Example

```bash
curl -X POST "https://everyminute.<your-subdomain>.workers.dev/api/github-repo" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/microsoft/vscode"}'
```
