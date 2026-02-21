/**
 * Extension safety evaluation (same logic as frontend and lib/evaluate-extension.js).
 * Used by the API to include trust (risk score, decision) in responses.
 */
export function evaluateExtension(metadata, policy) {
  let score = 0;
  const triggered = [];
  const triggeredWithPoints = [];

  function add(points, rule) {
    score += points;
    triggered.push(rule);
    triggeredWithPoints.push({ rule, points });
  }

  if (
    metadata.publisherChangedDaysAgo !== undefined &&
    metadata.publisherChangedDaysAgo < (policy.rules.publisher?.blockIfPublisherChangedDays ?? 90)
  ) {
    add(policy.weights.publisher, 'Publisher changed recently');
  }
  if (
    metadata.dormantMonths !== undefined &&
    metadata.dormantMonths > (policy.rules.publisher?.blockIfDormantMonths ?? 24)
  ) {
    add(policy.weights.publisher, 'Long dormancy detected');
  }

  if (
    metadata.lastUpdatedDaysAgo !== undefined &&
    metadata.lastUpdatedDaysAgo < (policy.rules.update?.highRiskRecentUpdateDays ?? 7)
  ) {
    add(policy.weights.update / 2, 'Recent update risk window');
  }
  if (
    metadata.dormantMonths !== undefined &&
    metadata.dormantMonths >= (policy.rules.update?.flagIfDormantMonths ?? 12)
  ) {
    add(policy.weights.update, 'No update in 12+ months');
  }
  if (metadata.majorVersionJumpAfterDormancy) {
    add(policy.weights.update, 'Major jump after dormancy');
  }

  if (
    metadata.installs !== undefined &&
    metadata.installs < (policy.rules.reputation?.minInstalls ?? 1000)
  ) {
    add(policy.weights.reputation / 2, 'Low install count');
  }
  if (
    metadata.rating !== undefined &&
    metadata.rating < (policy.rules.reputation?.minRating ?? 3)
  ) {
    add(policy.weights.reputation / 2, 'Low rating');
  }

  if (metadata.isObfuscated) add(policy.weights.behaviour, 'Obfuscated code');
  if (metadata.usesChildProcess) add(policy.weights.behaviour / 3, 'Uses child_process');
  if (metadata.usesEval) add(policy.weights.behaviour / 3, 'Uses eval');
  if (metadata.hasHardcodedIP) add(policy.weights.behaviour / 3, 'Hard coded IP');
  if (metadata.downloadsRemoteCode) add(policy.weights.behaviour, 'Downloads remote code');

  if (
    policy.rules.supplyChain?.requirePublicRepo &&
    metadata.hasPublicRepo === false
  ) {
    add(policy.weights.supplyChain, 'No public repository');
  }
  if (
    metadata.repoTransferredDaysAgo !== undefined &&
    metadata.repoTransferredDaysAgo < (policy.rules.supplyChain?.flagIfRepoTransferredRecentlyDays ?? 90)
  ) {
    add(policy.weights.supplyChain / 2, 'Recent repo transfer');
  }
  if (
    metadata.newMaintainerDaysAgo !== undefined &&
    metadata.newMaintainerDaysAgo < (policy.rules.supplyChain?.flagIfNewMaintainerDays ?? 60)
  ) {
    add(policy.weights.supplyChain / 2, 'New maintainer recently added');
  }

  const block = policy.thresholds?.block ?? 61;
  const review = policy.thresholds?.review ?? 31;
  let decision = 'ALLOW';
  if (score >= block) decision = 'BLOCK';
  else if (score >= review) decision = 'REVIEW';

  return { score, decision, triggeredRules: triggered, triggeredWithPoints };
}
