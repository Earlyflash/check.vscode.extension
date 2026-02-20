# check.vscode.extension

Web app to list VS Code extensions by ID (`publisher.extension`), fetch details from the Marketplace, and evaluate them against a configurable safety policy. Deploys as a **Cloudflare Worker** with static assets, so the URL is your Worker’s `*.workers.dev` address (e.g. `everyminute.<your-subdomain>.workers.dev`).

## Features

- Enter multiple extension IDs (one per line); validate format and fetch Marketplace data.
- Table: publisher, extension name, version, last update date, rating, installs, risk score, decision (ALLOW/REVIEW/BLOCK), triggered rules, link to Marketplace.
- Risk scoring from `public/extension-safety-policy.json`; breakdown when you select a row.
- Copy-to-Excel: tab-separated output for the table.

## Project structure (Worker + static assets)

```
├── public/                    # Static assets (served at site root)
│   ├── index.html
│   └── extension-safety-policy.json
├── api/
│   └── fetch-extensions.js    # API logic used by the Worker
├── worker.js                  # Worker entry: routes /api/fetch-extensions
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
