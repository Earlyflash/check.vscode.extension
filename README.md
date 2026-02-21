# check.vscode.extension

Web app to list VS Code extensions by ID (`publisher.extension`), fetch details from the Marketplace, and evaluate them against a configurable safety policy. Deploys as a **Cloudflare Worker** with static assets, so the URL is your Worker’s `*.workers.dev` address (e.g. `everyminute.<your-subdomain>.workers.dev`).

## Features

- Enter multiple extension IDs (one per line); validate format and fetch Marketplace data.
- Table: publisher, extension name, version, last update date, rating, installs, risk score, decision (ALLOW/REVIEW/BLOCK), triggered rules, link to Marketplace.
- Risk scoring from `public/extension-safety-policy.json`; breakdown when you select a row.
- Copy-to-Excel: tab-separated output for the table.

**API for external callers:** You can get extension details and trust (risk score, decision) from scripts or other apps. See [docs/API.md](docs/API.md) for the request/response format, limits, and examples. The same doc describes **GitHub repo data and trust**: `POST /api/github-repo` with a repo URL returns stars, forks, issues, activity, contributors, and a repo trust score from `public/github-repo-safety-policy.json` (see [docs/github-repo-trust-rules.md](docs/github-repo-trust-rules.md)).

**Tests:** Run `npm test` for extension evaluator tests; run `npm run test:repo` for GitHub repo trust evaluator tests.

## Project structure (Worker + static assets)

```
├── public/                    # Static assets (served at site root)
│   ├── index.html
│   ├── extension-safety-policy.json
│   └── github-repo-safety-policy.json
├── api/
│   ├── fetch-extensions.js    # Extension details + trust
│   ├── github-repo.js         # GitHub API: repo data
│   ├── github-repo-handler.js # POST /api/github-repo
│   ├── evaluate.js / evaluate-repo.js
├── worker.js                  # Routes /api/fetch-extensions, /api/github-repo
├── wrangler.toml              # Worker name, main, assets directory
├── package.json
└── evaluate-extension.js      # Standalone evaluator (Node/CI)
```

- **Static assets**: `public/` is served at `/` (e.g. `/` → `index.html`, `/extension-safety-policy.json`).
- **API**: The Worker handles `POST /api/fetch-extensions` and proxies the VS Code Marketplace API. All other non-asset requests return 404.

## Local development

From the project root:

```bash
npm install
npm run dev
```

Open the URL Wrangler prints (e.g. `http://localhost:8787`). “Fetch details” uses the local Worker.

## Deploy to Cloudflare Workers

Deploy from the project root. After deployment the app is available at your Worker’s URL, e.g. **`https://everyminute.<your-subdomain>.workers.dev`**.

```bash
npm install
npm run deploy
```

Or with Wrangler directly:

```bash
npx wrangler deploy
```

You will be prompted to log in if needed. The Worker name in `wrangler.toml` is `everyminute`; to use a different `*.workers.dev` subdomain, change the `name` in `wrangler.toml` and deploy again.

**What gets deployed**

- **Worker script** (`worker.js`): runs for requests that don’t match a static file (e.g. `POST /api/fetch-extensions`).
- **Static assets** (`public/`): served for `/`, `/index.html`, `/extension-safety-policy.json`, etc.

No separate “Pages” project; everything is one Worker with an assets directory.

## Extension safety policy

- **Policy file**: `public/extension-safety-policy.json` (weights, thresholds, rules).
- **Browser**: The same evaluation logic runs in the UI (see `evaluateExtension` in `index.html`).
- **Node/CI**: `evaluate-extension.js` exports `evaluateExtension(metadata, policy)`; no dependencies. Example: `node evaluate-extension.js`.

Scoring uses Marketplace data (update date, installs, rating) plus optional metadata (behaviour, supply chain) when provided.
