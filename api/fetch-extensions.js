const MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=3.0-preview.1';

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
  };
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
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const results = await Promise.all(extensions.map((id) => fetchOneExtension(id)));
  return Response.json({ results });
}
