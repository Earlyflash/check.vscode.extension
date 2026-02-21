import { evaluateExtension } from './evaluate.js';

const MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=3.0-preview.1';

const ASSET_TYPE_REPOSITORY = 'Microsoft.VisualStudio.Services.Links.Source';

// Known public hosts; repo URL from manifest/Marketplace is considered "public" if it points here.
const PUBLIC_REPO_HOSTS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'sourceforge.net',
  'codeberg.org',
];

function getRepositoryUrlFromVersion(version) {
  if (!version) return null;
  if (version.properties && Array.isArray(version.properties)) {
    const repoProp = version.properties.find((p) => p.key === ASSET_TYPE_REPOSITORY && p.value);
    if (repoProp && typeof repoProp.value === 'string') return repoProp.value.trim();
  }
  return null;
}

function isPublicRepoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.startsWith('git@') ? `https://${url.replace(':', '/')}` : url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return PUBLIC_REPO_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

async function fetchOneExtension(extensionId) {
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

  const repoUrl = getRepositoryUrlFromVersion(latest);
  const hasPublicRepo = isPublicRepoUrl(repoUrl);

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
// Stay under Cloudflare Workers subrequest limit (50 on free tier = 1 policy fetch + N Marketplace fetches).
const MAX_EXTENSIONS = 49;

async function runInBatches(arr, batchSize, fn) {
  const results = [];
  for (let i = 0; i < arr.length; i += batchSize) {
    const batch = arr.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function handleFetchExtensions(request) {
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
    let results = await runInBatches(extensions, BATCH_SIZE, (id) => fetchOneExtension(id));

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
