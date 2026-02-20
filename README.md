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

## Deploy to Cloudflare Pages (Git)

For **Fetch details** to work, the `functions` directory must be deployed. Use Git-based deploy:

1. Push this repo to GitHub/GitLab.
2. In [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → your project → **Settings** → **Builds & deployments**.
3. Set **Build configuration**:
   - **Build output directory:** `public`
   - **Build command** or **Deploy command** (whichever is required): use **`exit 0`**. That satisfies the mandatory field and exits successfully so Cloudflare deploys your `public` folder and `functions` without running wrangler (no API token needed).
4. **Do not** use `npx wrangler pages deploy` as the deploy command — that requires an API token and causes authentication errors in the build.
5. Save and redeploy (or push a commit).

**CLI deploy** (uploads `public` only; for API use Git deploy):

```bash
npm run deploy
```

Or run the **Pages** deploy command (must include **`pages`**):

```bash
npx wrangler pages deploy public --project-name=check-vscode-extension
```

On Windows you can also run: `.\deploy.ps1`

---

**If you see:** *"Authentication error [code: 10000]"* when deploying via Git

The deploy/build command is running `wrangler pages deploy`, which needs an API token. **Fix:** In Pages → Settings → Builds & deployments, set **Build output directory** to `public` and set the deploy (or build) command to **`exit 0`** instead of the wrangler command. Cloudflare will then deploy without running wrangler.

---

**If you see:** *"It looks like you've run a Workers-specific command in a Pages project"*

You ran **`wrangler deploy`** (Workers). This repo is a **Pages** project. Use one of the commands above instead (e.g. **`npm run deploy`** or **`wrangler pages deploy ...`**).