/**
 * Fetch-extensions API: fetches VS Code extension details from the Marketplace,
 * loads extension-safety-policy.json, and attaches trust (riskScore, riskDecision,
 * triggeredRules, riskBreakdown). Also sets hasPublicRepo and repoUrl from the
 * extension's Repository link when present.
 * Used by: src/worker.js for POST /api/fetch-extensions.
 */
import { evaluateExtension } from './evaluate.js';

const MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=3.0-preview.1';

const ASSET_TYPE_REPOSITORY = 'Microsoft.VisualStudio.Services.Links.Source';
const ASSET_TYPE_MANIFEST = 'Microsoft.VisualStudio.Code.Manifest';

// Known public hosts; repo URL from manifest/Marketplace is considered "public" if it points here.
const PUBLIC_REPO_HOSTS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'sourceforge.net',
  'codeberg.org',
];

/** Get repo URL from version.properties (Marketplace sometimes omits this). */
function getRepositoryUrlFromVersion(version) {
  if (!version) return null;
  if (version.properties && Array.isArray(version.properties)) {
    const repoProp = version.properties.find((p) => p.key === ASSET_TYPE_REPOSITORY && p.value);
    if (repoProp && typeof repoProp.value === 'string') return repoProp.value.trim();
  }
  return null;
}

/**
 * Fetch extension manifest (package.json) from Marketplace and parse repository field.
 * Supports: "repository": "url", "repository": { "type": "git", "url": "..." }, "repository": "github:owner/repo".
 * Tries version.assetUri first, then gallery publisher/extension assetbyname URL.
 */
async function getRepositoryUrlFromManifest(version, ext) {
  let manifestUrl = null;
  const base = version?.fallbackAssetUri || version?.assetUri;
  if (base && typeof base === 'string') {
    manifestUrl = `${base.replace(/\/$/, '')}/${ASSET_TYPE_MANIFEST}`;
  } else if (ext?.publisher?.publisherName && ext?.extensionName && version?.version) {
    const publisher = encodeURIComponent(ext.publisher.publisherName.toLowerCase());
    const extensionName = encodeURIComponent(ext.extensionName.toLowerCase());
    const ver = encodeURIComponent(version.version);
    manifestUrl = `https://${ext.publisher.publisherName.toLowerCase()}.gallery.vsassets.io/_apis/public/gallery/publisher/${publisher}/extension/${extensionName}/${ver}/assetbyname/${ASSET_TYPE_MANIFEST}`;
  }
  if (!manifestUrl) return null;
  try {
    const res = await fetch(manifestUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const manifest = await res.json();
    const repo = manifest?.repository;
    if (!repo) return null;
    if (typeof repo === 'string') {
      const s = repo.trim();
      if (s.startsWith('github:')) {
        const rest = s.slice(7).trim().replace(/^\/+|\/+$/g, '');
        return rest ? `https://github.com/${rest}` : null;
      }
      return s || null;
    }
    if (repo && typeof repo.url === 'string') return repo.url.trim();
    return null;
  } catch {
    return null;
  }
}

function isPublicRepoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.startsWith('git@') ? `https://${url.replace(':', '/')}` : url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const isKnownHost = PUBLIC_REPO_HOSTS.some((h) => host === h || host.endsWith('.' + h));
    if (!isKnownHost) return false;
    const pathSegments = u.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    return pathSegments.length >= 2;
  } catch {
    return false;
  }
}

/** Parse GitHub owner/repo from URL; returns null if not GitHub or invalid. */
function parseGitHubOwnerRepo(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url.startsWith('git@') ? `https://${url.replace(':', '/')}` : url);
    if (!/^(?:www\.)?github\.com$/i.test(u.hostname)) return null;
    const segments = u.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (segments.length < 2) return null;
    return { owner: segments[0], repo: segments[1].replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

/** Verify the GitHub repo exists (200). Returns false on 404, 403, or error. Optional githubToken for higher rate limits. */
async function verifyGitHubRepoExists(repoUrl, githubToken) {
  const parsed = parseGitHubOwnerRepo(repoUrl);
  if (!parsed) return false;
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'check-vscode-extension/1.0',
  };
  if (githubToken && typeof githubToken === 'string') {
    headers.Authorization = `Bearer ${githubToken}`;
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`,
      { headers }
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchOneExtension(extensionId, options = {}) {
  const body = {
    filters: [
      {
        criteria: [{ filterType: 7, value: extensionId }],
        pageSize: 1,
        pageNumber: 1,
      },
    ],
    flags: 258,
  };

  const res = await fetch(MARKETPLACE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json;api-version=3.0-preview.1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return {
      extensionId,
      error: `HTTP ${res.status}`,
      publisher: '',
      extensionName: '',
      currentVersion: '',
      lastVersion: '',
      lastVersionUpdateDate: '',
      rating: '',
      ratingCount: '',
      installCount: '',
      publisherVerified: false,
      hasPublicRepo: false,
      repoUrl: undefined,
    };
  }

  const data = await res.json();
  const exts = data?.results?.[0]?.extensions;
  if (!exts || exts.length === 0) {
    return {
      extensionId,
      error: 'Not found',
      publisher: '',
      extensionName: '',
      currentVersion: '',
      lastVersion: '',
      lastVersionUpdateDate: '',
      rating: '',
      ratingCount: '',
      installCount: '',
      publisherVerified: false,
      hasPublicRepo: false,
      repoUrl: undefined,
    };
  }

  const ext = exts[0];
  const versions = ext.versions || [];
  const latest = versions[0];
  const currentVersion = latest?.version ?? '';
  const lastVersionUpdateDateRaw = latest?.lastUpdated ?? ext.lastUpdated ?? '';
  const lastVersionUpdateDate = lastVersionUpdateDateRaw
    ? new Date(lastVersionUpdateDateRaw).toISOString().slice(0, 10)
    : '';

  const stat = (ext.statistics || []).find((s) => s.statisticName === 'averagerating');
  const rating = stat != null ? String(Number(stat.value).toFixed(2)) : '';
  const ratingCountStat = (ext.statistics || []).find((s) => s.statisticName === 'ratingcount');
  const ratingCount = ratingCountStat != null ? String(Math.round(Number(ratingCountStat.value))) : '';
  const installStat = (ext.statistics || []).find((s) => s.statisticName === 'install');
  const installCount = installStat != null ? String(Math.round(Number(installStat.value))) : '';
  const publisherFlags = ext.publisher?.flags ?? '';
  const publisherVerified = typeof publisherFlags === 'string' && publisherFlags.indexOf('verified') !== -1;

  let repoUrl = getRepositoryUrlFromVersion(latest);
  if (!repoUrl && latest) {
    repoUrl = await getRepositoryUrlFromManifest(latest, ext);
  }
  let hasPublicRepo = isPublicRepoUrl(repoUrl);
  if (hasPublicRepo && repoUrl && parseGitHubOwnerRepo(repoUrl)) {
    const exists = await verifyGitHubRepoExists(repoUrl, options.githubToken);
    if (!exists) hasPublicRepo = false;
  }

  return {
    extensionId,
    error: '',
    publisher: ext.publisher?.publisherName ?? '',
    extensionName: ext.extensionName ?? '',
    currentVersion,
    lastVersion: currentVersion,
    lastVersionUpdateDate,
    rating,
    ratingCount,
    installCount,
    publisherVerified,
    hasPublicRepo,
    repoUrl: repoUrl || undefined,
  };
}

const BATCH_SIZE = 10;
// Stay under Cloudflare Workers subrequest limit (50 on free tier).
// Per extension: 1 Marketplace query + optional manifest + optional GitHub repo verify. Plus 1 for policy.
const MAX_EXTENSIONS = 16;

async function runInBatches(arr, batchSize, fn) {
  const results = [];
  for (let i = 0; i < arr.length; i += batchSize) {
    const batch = arr.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function handleFetchExtensions(request, env = {}) {
  let extensions;
  try {
    const body = await request.json();
    extensions = body?.extensions;
    if (!Array.isArray(extensions) || extensions.length === 0) {
      return Response.json({ error: 'Missing or empty "extensions" array' }, { status: 400 });
    }
    extensions = extensions.map((s) => String(s).trim()).filter(Boolean);
    if (extensions.length === 0) {
      return Response.json({ error: 'No extension IDs provided' }, { status: 400 });
    }
    if (extensions.length > MAX_EXTENSIONS) {
      return Response.json(
        {
          error: `Too many extensions (max ${MAX_EXTENSIONS} per request). Split your list into smaller batches and call the API once per batch, or reduce the number. On Cloudflare free tier, "Too many subrequests" means the same limit.`,
        },
        { status: 400 }
      );
    }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const githubToken = env?.GITHUB_TOKEN;
    let results = await runInBatches(extensions, BATCH_SIZE, (id) =>
      fetchOneExtension(id, { githubToken })
    );

    const origin = new URL(request.url).origin;
    let policy = null;
    try {
      const policyRes = await fetch(`${origin}/extension-safety-policy.json`);
      if (policyRes.ok) policy = await policyRes.json();
    } catch {
      // continue without trust fields
    }

    if (policy?.weights && policy?.thresholds && policy?.rules) {
      results = results.map((r) => {
        const installs = r.installCount ? parseInt(r.installCount, 10) : undefined;
        const rating = r.rating ? parseFloat(r.rating) : undefined;
        let lastUpdatedDaysAgo;
        let dormantMonths;
        if (r.lastVersionUpdateDate) {
          const d = new Date(r.lastVersionUpdateDate);
          if (!isNaN(d.getTime())) {
            lastUpdatedDaysAgo = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
            dormantMonths = Math.floor(lastUpdatedDaysAgo / 30.44);
          }
        }
        const metadata = {
          publisherVerified: r.publisherVerified === true,
          lastUpdatedDaysAgo,
          dormantMonths,
          installs,
          rating,
          hasPublicRepo: r.hasPublicRepo === true,
          usesChildProcess: false,
          usesEval: false,
          hasHardcodedIP: false,
          downloadsRemoteCode: false,
          isObfuscated: false,
        };
        const evalResult = evaluateExtension(metadata, policy);
        return {
          ...r,
          riskScore: evalResult.score,
          riskDecision: evalResult.decision,
          triggeredRules: evalResult.triggeredRules,
          riskBreakdown: evalResult.triggeredWithPoints,
        };
      });
    }

    return Response.json({ results });
  } catch (err) {
    console.error('handleFetchExtensions error:', err);
    const msg =
      err?.message?.includes('subrequest') || err?.message?.includes('Too many')
        ? `Too many subrequests. Use at most ${MAX_EXTENSIONS} extensions per request and call the API in batches for larger lists.`
        : err?.message || 'Failed to fetch extension data. Try fewer extensions or try again.';
    return Response.json({ error: msg }, { status: 500 });
  }
}
