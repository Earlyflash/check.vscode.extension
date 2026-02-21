/**
 * GitHub repo trustworthiness evaluation (CommonJS for Node).
 * Same logic as src/api/evaluate-repo.js. Use in tests: node test/evaluate-repo.test.js
 */

function evaluateRepo(metadata, policy) {
  let score = 0;
  const triggered = [];
  const triggeredWithPoints = [];

  function add(points, rule) {
    score += points;
    triggered.push(rule);
    triggeredWithPoints.push({ rule, points });
  }

  const W = policy.weights || {};
  const R = policy.rules || {};
  const eng = R.engagement || {};
  const health = R.health || {};
  const fresh = R.freshness || {};
  const maint = R.maintainers || {};

  const minStars = eng.minStars ?? 10;
  if (
    eng.flagIfVeryLowStars !== false &&
    metadata.stars !== undefined &&
    metadata.stars < minStars
  ) {
    add((W.engagement ?? 25) / 2, 'Low star count');
  }
  if (
    eng.flagIfZeroForks !== false &&
    metadata.forks !== undefined &&
    metadata.forks < (eng.minForks ?? 1)
  ) {
    add((W.engagement ?? 25) / 2, 'No or very few forks');
  }

  const maxOpen = health.maxOpenIssues ?? 50;
  if (
    metadata.openIssues !== undefined &&
    metadata.openIssues > maxOpen
  ) {
    add((W.health ?? 25) / 2, 'High open issue count');
  }
  if (
    health.flagIfHighOpenIssuesRatio !== false &&
    metadata.stars !== undefined &&
    metadata.openIssues !== undefined &&
    metadata.stars > 0
  ) {
    const ratio = metadata.openIssues / metadata.stars;
    const maxRatio = health.openIssuesToStarsRatio ?? 2;
    if (ratio > maxRatio) {
      add((W.health ?? 25) / 2, 'High open-issues-to-stars ratio');
    }
  }

  const minAge = fresh.minRepoAgeDays ?? 90;
  if (
    fresh.flagIfVeryNewRepo !== false &&
    metadata.ageDays !== undefined &&
    metadata.ageDays < minAge
  ) {
    add((W.freshness ?? 25) / 2, 'Repo very new');
  }
  const maxDaysSincePush = fresh.maxDaysSincePush ?? 365;
  if (
    fresh.flagIfDormant !== false &&
    metadata.daysSincePush !== undefined &&
    metadata.daysSincePush > maxDaysSincePush
  ) {
    add((W.freshness ?? 25) / 2, 'Repo dormant (no recent push)');
  }

  const minContrib = maint.minContributors ?? 1;
  const contrib = metadata.contributorCount;
  if (typeof contrib === 'number') {
    if (contrib < minContrib) {
      add(W.maintainers ?? 25, 'No contributors listed');
    } else if (maint.flagIfSoloMaintainer !== false && contrib === 1) {
      add((W.maintainers ?? 25) / 2, 'Solo maintainer');
    }
  }

  const block = policy.thresholds?.block ?? 45;
  const review = policy.thresholds?.review ?? 20;
  let decision = 'ALLOW';
  if (score >= block) decision = 'BLOCK';
  else if (score >= review) decision = 'REVIEW';

  return { score, decision, triggeredRules: triggered, triggeredWithPoints };
}

module.exports = { evaluateRepo };
