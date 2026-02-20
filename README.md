# check.vscode.extension

Web app to list VS Code extensions by ID (`publisher.extension`), fetch details from the Marketplace, and evaluate them against a configurable safety policy. Built for [Cloudflare Pages](https://pages.cloudflare.com/) with **Pages Functions** for the API.

## Features

- Enter multiple extension IDs (one per line); validate format and fetch Marketplace data.
- Table: publisher, extension name, version, last update date, rating, installs, risk score, decision (ALLOW/REVIEW/BLOCK), triggered rules, link to Marketplace.
- Risk scoring from `public/extension-safety-policy.json`; breakdown when you select a row.
- Copy-to-Excel: tab-separated output for the table.

## Project structure (Cloudflare Pages + Functions)

```
├── public/                    # Static assets (build output)
│   ├── index.html
│   └── extension-safety-policy.json
├── functions/                 # Pages Functions (serverless API)
│   └── api/
│       └── fetch-extensions.js   → POST /api/fetch-extensions
├── wrangler.toml              # Pages config: name, pages_build_output_dir
├── package.json
└── evaluate-extension.js      # Standalone evaluator (Node/CI)
```

- **Static site**: `public/` is served as the site root. No build step.
- **API**: `functions/api/fetch-extensions.js` handles `POST /api/fetch-extensions` and proxies the VS Code Marketplace API. The UI calls this for “Fetch details”.
- **Deployment must include both** `public` and `functions` so the app works end-to-end.

## Local development

From the **project root** (so Wrangler sees both `public` and `functions`):

```bash
npm install
npm run dev
```

Then open the URL Wrangler prints (e.g. `http://localhost:8788`). “Fetch details” uses the local Function.

## Deploy to Cloudflare Pages

Use one of the following. In both cases the **project root** is the directory that contains `public/`, `functions/`, and `wrangler.toml`.

### Option 1: Git (recommended)

1. Push this repo to GitHub or GitLab.
2. In [Cloudflare Dashboard](https://dash.cloudflare.com) go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**. Select the repo.
3. **Build settings**:
   - **Project name**: any name (e.g. `check-vscode-extension`).
   - **Production branch**: e.g. `main`.
   - **Root directory**: leave blank (use repo root).
   - **Build command**: `exit 0` (no build; required if the field is mandatory).
   - **Build output directory**: `public`.
4. **Save** and deploy. Cloudflare will serve `public/` as the site and deploy `functions/` from the repo root as Pages Functions.

Do **not** set a custom deploy command that runs `wrangler pages deploy` in the Git build; the built-in Git deployment already deploys both static assets and Functions. Using `wrangler` in the build requires an API token and can cause authentication errors.

### Option 2: Wrangler CLI (direct upload)

From the **project root** (directory that contains `public/`, `functions/`, and `wrangler.toml`):

```bash
npm install
npx wrangler pages deploy public --project-name=check-vscode-extension
```

You will be prompted to log in if needed. This uploads the contents of `public/` as the static site and deploys the `functions/` in the same project (Wrangler uses the current directory as the project context). The project name must match an existing Pages project or one will be created.

**Note:** Use `wrangler pages deploy`, not `wrangler deploy`. This is a Pages project; `wrangler deploy` is for Workers.

## Extension safety policy

- **Policy file**: `public/extension-safety-policy.json` (weights, thresholds, rules).
- **Browser**: The same evaluation logic runs in the UI (see `evaluateExtension` in `index.html`).
- **Node/CI**: `evaluate-extension.js` exports `evaluateExtension(metadata, policy)`; no dependencies. Example: `node evaluate-extension.js`.

Scoring uses Marketplace data (update date, installs, rating) plus optional metadata (behaviour, supply chain) when provided.
