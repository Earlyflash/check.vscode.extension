/**
 * Fetch GitHub repository metadata from the GitHub API.
 * Used to compute repo trustworthiness (stars, forks, issues, activity, contributors).
 * Unauthenticated: 60 requests/hour. Set GITHUB_TOKEN in wrangler for 5000/hour.
 */

const GITHUB_API = 'https://api.github.com';

/**
 * Parse a GitHub repo URL or "owner/repo" string into { owner, repo } or null.
 * Supports: https://github.com/owner/repo, https://github.com/owner/repo/, git@github.com:owner/repo.git
 */
export function parseGitHubRepoUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const s = url.trim();
  if (!s) return null;
  try {
    if (s.includes('/')) {
      if (s.startsWith('git@')) {
        const match = s.match(/git@(?:[\w.-]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
        if (match) return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
        return null;
      }
      const u = new URL(s.startsWith('http') ? s : `https://${s}`);
      if (!/^(?:www\.)?github\.com$/i.test(u.hostname)) return null;
      const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
      if (parts.length >= 2) return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
      if (parts.length === 1) return null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse GitHub API Link header and return total count when per_page is known.
 * Link format: <url>; rel="last" -> extract page from that url.
 */
function getTotalFromLinkHeader(linkHeader, perPage) {
  if (!linkHeader || perPage < 1) return null;
  const lastLink = linkHeader.match(/<([^>]+)>;\s*rel="last"/i);
  if (!lastLink) return null;
  const pageMatch = lastLink[1].match(/[?&]page=(\d+)/);
  if (!pageMatch) return null;
  const lastPage = parseInt(pageMatch[1], 10);
  if (isNaN(lastPage)) return null;
  return lastPage * perPage;
}

/**
 * Fetch open pull requests count (single request, use Link header for total).
 */
async function fetchOpenPullsCount(owner, repo, headers) {
  const res = await fetch(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=1`,
    { headers }
  );
  if (!res.ok) return null;
  const link = res.headers.get('Link');
  const total = getTotalFromLinkHeader(link, 1);
  if (total !== null) return total;
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

/**
 * Fetch contributors count (one page; we use length or Link last for total).
 * API returns up to per_page contributors. For total we need Link rel=last.
 */
async function fetchContributorsCount(owner, repo, headers) {
  const res = await fetch(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors?per_page=1`,
    { headers }
  );
  if (!res.ok) return null;
  const total = getTotalFromLinkHeader(res.headers.get('Link'), 1);
  if (total !== null) return total;
  const json = await res.json();
  return Array.isArray(json) ? json.length : null;
}

/**
 * Fetch repository data from GitHub API.
 * Returns normalized object: stars, forks, openIssues, openPullRequests, createdAt, updatedAt, pushedAt,
 * ageDays, daysSincePush, contributorCount, defaultBranch, and raw fields for flexibility.
 * Returns { error: string } on failure.
 */
export async function getGitHubRepoData(repoUrl, env = {}) {
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) {
    return { error: 'Invalid or non-GitHub repo URL' };
  }
  const { owner, repo } = parsed;
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'check-vscode-extension/1.0',
  };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers,
  });

  if (!res.ok) {
    if (res.status === 404) return { error: 'Repository not found' };
    if (res.status === 403) {
      const remaining = res.headers.get('X-RateLimit-Remaining');
      return { error: `GitHub API limit exceeded${remaining !== null ? ` (${remaining} remaining)` : ''}` };
    }
    return { error: `GitHub API error: ${res.status}` };
  }

  const data = await res.json();
  const now = Date.now();
  const createdAt = data.created_at ? new Date(data.created_at).getTime() : null;
  const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : null;
  const pushedAt = data.pushed_at ? new Date(data.pushed_at).getTime() : null;

  const ageDays = createdAt != null ? Math.floor((now - createdAt) / (24 * 60 * 60 * 1000)) : null;
  const daysSincePush = pushedAt != null ? Math.floor((now - pushedAt) / (24 * 60 * 60 * 1000)) : null;

  const [openPullRequests, contributorCount] = await Promise.all([
    fetchOpenPullsCount(owner, repo, headers),
    fetchContributorsCount(owner, repo, headers),
  ]);

  return {
    owner,
    repo,
    url: data.html_url || `https://github.com/${owner}/${repo}`,
    stars: typeof data.stargazers_count === 'number' ? data.stargazers_count : 0,
    forks: typeof data.forks_count === 'number' ? data.forks_count : 0,
    openIssues: typeof data.open_issues_count === 'number' ? data.open_issues_count : 0,
    openPullRequests: openPullRequests ?? null,
    defaultBranch: data.default_branch || 'main',
    createdAt: data.created_at || null,
    updatedAt: data.updated_at || null,
    pushedAt: data.pushed_at || null,
    ageDays,
    daysSincePush,
    contributorCount: contributorCount ?? null,
    hasIssuesEnabled: data.has_issues === true,
    hasWiki: data.has_wiki === true,
    language: data.language || null,
    description: data.description || null,
  };
}
