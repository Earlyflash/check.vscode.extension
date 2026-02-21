# Documentation

This folder contains all project documentation.

## Quick links

| Document | Description |
|----------|-------------|
| [API.md](API.md) | **REST API reference** – `POST /api/fetch-extensions`, `POST /api/github-repo`, request/response formats, limits, examples (curl, PowerShell, fetch). |
| [extension-safety-policy.md](extension-safety-policy.md) | **Extension trust rules** – How extension risk is scored (publisher, update, reputation, behaviour, supply chain), policy file shape, thresholds. |
| [github-repo-trust-rules.md](github-repo-trust-rules.md) | **GitHub repo trust rules** – How repo risk is scored (engagement, health, freshness, maintainers), policy file shape. |
| [architecture.md](architecture.md) | **Architecture** – Worker, static assets, request flow, data sources (Marketplace, GitHub), policy loading. |
| [configuration.md](configuration.md) | **Configuration** – `wrangler.toml`, environment variables (`GITHUB_TOKEN`), policy JSON files, deployment. |

## Summary

- **Extension trust**: VS Code Marketplace data + optional behaviour/supply-chain metadata → scored by `extension-safety-policy.json` → `riskScore`, `riskDecision`, `triggeredRules`.
- **Repo trust**: GitHub API data (stars, forks, issues, activity, contributors) → scored by `github-repo-safety-policy.json` → `repoTrust.score`, `repoTrust.decision`.
- **APIs**: Extension details and trust in one call (`POST /api/fetch-extensions`). Repo data and trust in a separate call (`POST /api/github-repo`) when you have a repo URL (e.g. from `repoUrl` in fetch-extensions results).

## Other files

- **Policy JSON**: `public/extension-safety-policy.json`, `public/github-repo-safety-policy.json` – editable weights, thresholds, and rule parameters; see the policy docs above.
- **Source**: `src/worker.js` (entrypoint), `src/api/*.js` (handlers and evaluators used by the Worker).
- **Standalone evaluators** (Node/CI): `lib/evaluate-extension.js`, `lib/evaluate-repo-extension.js` – same logic as Worker, no network; used by tests.
- **Tests**: `test/evaluate.test.js` (extension rules), `test/evaluate-repo.test.js` (repo rules); run via `npm test` and `npm run test:repo`.
