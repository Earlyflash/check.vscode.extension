# Configuration

How to configure the Worker, environment variables, and policy files.

## wrangler.toml

The Worker is configured in the project root as `wrangler.toml`.

| Key | Purpose |
|-----|---------|
| **name** | Worker name; determines `*.workers.dev` subdomain (e.g. `everyminute` → `everyminute.<account>.workers.dev`). |
| **main** | Entry script: `src/worker.js`. |
| **compatibility_date** | Compatibility date for the Workers runtime. |
| **[assets]** | |
| **directory** | `./public/` – static files served at site root. |
| **not_found_handling** | `"single-page-application"` – unknown paths serve `index.html`. |
| **run_worker_first** | `["/api/*"]` – requests under `/api/` are handled by the Worker before asset lookup. |

To use a different Worker URL, change `name` and redeploy.

## Environment variables / secrets

| Variable | Used by | Purpose |
|----------|---------|---------|
| **GITHUB_TOKEN** | `src/api/github-repo.js` (via `env` in `getGitHubRepoData`) | Optional. When set, sent as `Authorization: Bearer ...` to the GitHub API. Increases rate limit (e.g. 5000 requests/hour). Without it, unauthenticated limit is 60/hour. |

**Setting the token**

- **Local dev**: In `.dev.vars` (create in project root; this file is listed in `.gitignore`):  
  `GITHUB_TOKEN=ghp_...`
- **Deployed Worker**:  
  `npx wrangler secret put GITHUB_TOKEN`  
  Or in dashboard: Workers → your worker → Settings → Variables and Secrets.

Do not put the token in `wrangler.toml`; use secrets or `.dev.vars`. The repo `.gitignore` includes `node_modules/`, `.wrangler/`, `.dev.vars`, and `*.log`.

## Policy files

Both policy files are JSON and live in `public/` so they are served at the same origin and loaded by the Worker (and optionally by the browser).

### Extension safety policy

- **Path**: `public/extension-safety-policy.json`
- **URL**: `GET /extension-safety-policy.json`
- **Used by**: `src/api/fetch-extensions.js`, `src/api/evaluate.js`, browser (risk breakdown), `lib/evaluate-extension.js`, tests.

Structure: **version**, **weights** (publisher, update, reputation, behaviour, supplyChain), **thresholds** (review, block), **rules** (nested per category). See [extension-safety-policy.md](extension-safety-policy.md).

### GitHub repo safety policy

- **Path**: `public/github-repo-safety-policy.json`
- **URL**: `GET /github-repo-safety-policy.json`
- **Used by**: `src/api/github-repo-handler.js`, `src/api/evaluate-repo.js`, `lib/evaluate-repo-extension.js`, tests.

Structure: **version**, **description**, **weights** (engagement, health, freshness, maintainers), **thresholds** (review, block), **rules** (nested per category). See [github-repo-trust-rules.md](github-repo-trust-rules.md).

### Changing behaviour

- Edit the JSON files in `public/` and redeploy (or refresh in dev).
- Adjust **weights** to change how much each category contributes to the score.
- Adjust **thresholds** to change which scores map to REVIEW vs BLOCK.
- Adjust **rules** (e.g. `minInstalls`, `minStars`, `flagIfDormant`) to change when rules fire. Set a `flagIf...` to `false` to disable that rule.

## npm scripts

| Script | Command | Purpose |
|--------|---------|---------|
| **dev** | `wrangler dev` | Local dev server (Worker + assets). |
| **deploy** | `wrangler deploy` | Deploy Worker and assets to Cloudflare. |
| **test** | `node test/evaluate.test.js` | Run extension evaluator tests. |
| **test:repo** | `node test/evaluate-repo.test.js` | Run GitHub repo evaluator tests. |

## Deployment

- **Install**: `npm install`
- **Deploy**: `npm run deploy` or `npx wrangler deploy`
- **Local dev**: `npm run dev` – Wrangler serves assets and runs the Worker locally (e.g. `http://localhost:8787`).

After deployment, the app is at `https://<name>.<your-subdomain>.workers.dev`. No separate build step; the Worker and assets are deployed as-is.

## Testing

- **Extension evaluator**: `npm test` runs `test/evaluate.test.js` (uses `lib/evaluate-extension.js`, loads `public/extension-safety-policy.json`).
- **Repo evaluator**: `npm run test:repo` runs `test/evaluate-repo.test.js` (uses `lib/evaluate-repo-extension.js`, loads `public/github-repo-safety-policy.json`).

Both test suites use the CommonJS modules in `lib/` and require no network.
