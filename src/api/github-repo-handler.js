/**
 * API handler: POST /api/github-repo
 * Body: { repoUrl: "https://github.com/owner/repo" }
 * Returns: { repo, repoTrust } or { error }.
 */

import { getGitHubRepoData } from './github-repo.js';
import { evaluateRepo } from './evaluate-repo.js';

export async function handleGitHubRepo(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const repoUrl = body?.repoUrl ?? body?.url;
  if (!repoUrl || typeof repoUrl !== 'string') {
    return Response.json({ error: 'Missing "repoUrl" or "url" in body' }, { status: 400 });
  }

  const repo = await getGitHubRepoData(repoUrl.trim(), env || {});
  if (repo.error) {
    return Response.json({ error: repo.error }, { status: 400 });
  }

  let policy = null;
  try {
    const policyRes = await fetch(`${origin}/github-repo-safety-policy.json`);
    if (policyRes.ok) policy = await policyRes.json();
  } catch {
    // continue without repoTrust
  }

  let repoTrust = null;
  if (policy?.weights && policy?.thresholds && policy?.rules) {
    const metadata = {
      stars: repo.stars,
      forks: repo.forks,
      openIssues: repo.openIssues,
      ageDays: repo.ageDays,
      daysSincePush: repo.daysSincePush,
      contributorCount: repo.contributorCount,
    };
    repoTrust = evaluateRepo(metadata, policy);
  }

  return Response.json({ repo, repoTrust });
}
