# Extension details and trust API

This API returns **details** (from the VS Code Marketplace) and **trust** (risk score and decision from the extension safety policy) for a list of extensions. You can call it from scripts, CI, or other apps.

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
- **Limit:** Up to **250** extension IDs per request. Larger requests get `400` with an error message.

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
| 400    | Bad request: missing/invalid body, no extension IDs, or more than 250 IDs. |
| 500    | Server error (e.g. Marketplace timeout). |

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
