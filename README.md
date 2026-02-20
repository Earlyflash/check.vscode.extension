# check.vscode.extension

A small site for entering and validating multiple VS Code extension names in `publisher.extension` format. Hosted on [Cloudflare Pages](https://pages.cloudflare.com/).

## UI

- **Extension names**: Enter one extension ID per line (e.g. `ms-python.python`, `esbenp.prettier-vscode`).
- **Parsed list**: Shows each line with OK / Invalid based on the `publisher.extension` format.

## Deploy to Cloudflare Pages

**Option A – Wrangler (CLI)**

```bash
npm install -g wrangler
wrangler pages deploy public --project-name=check-vscode-extension
```

**Option B – Git**

1. Push this repo to GitHub/GitLab.
2. In [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create project → Connect to Git.
3. Set **Build output directory** to `public`. Leave build command empty.
4. Deploy.