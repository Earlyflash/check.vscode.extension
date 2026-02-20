# check.vscode.extension

A small site for entering multiple VS Code extension names in `publisher.extension` format and fetching their details from the VS Code Marketplace. Hosted on [Cloudflare Pages](https://pages.cloudflare.com/).

## UI

- **Extension names**: Enter one extension ID per line (e.g. `ms-python.python`, `esbenp.prettier-vscode`).
- **Parsed list**: Shows each line as OK or Invalid format.
- **Fetch details**: Calls the Marketplace API and shows publisher, extension name, current/last version, last version update date, and rating.
- **Copy to Excel**: Results are shown as a table and as tab-separated text so you can paste into Excel or Google Sheets.

## Local development

From the project root (so that both `public` and `functions` are used):

```bash
npx wrangler pages dev public
```

Open http://localhost:8788 (or the port Wrangler prints). The “Fetch details” button uses the `/api/fetch-extensions` function.

## Deploy to Cloudflare Pages

For **Fetch details** to work, the `functions` directory must be deployed. Use Git-based deploy:

1. Push this repo to GitHub/GitLab.
2. In [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create project → Connect to Git.
3. Set **Build output directory** to `public`. Leave build command empty.
4. Deploy.

**CLI deploy** (uploads `public` only; for API use Git deploy):

```bash
npm install -g wrangler
npm run deploy
```

Or directly: **`wrangler pages deploy`** (not `wrangler deploy` — that is for Workers).