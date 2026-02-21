/**
 * Extension safety evaluation engine (CommonJS for Node).
 * Same logic as src/api/evaluate.js. Use in tests and CI:
 *   node -e "const {evaluateExtension}=require('./lib/evaluate-extension');..."
 *
 * Policy: load from public/extension-safety-policy.json or pass as object.
 */

function evaluateExtension(metadata, policy) {
  let score = 0;
  const triggered = [];

  if (
    metadata.publisherChangedDaysAgo !== undefined &&
    metadata.publisherChangedDaysAgo < (policy.rules.publisher?.blockIfPublisherChangedDays ?? 90)
  ) {
    score += policy.weights.publisher;
    triggered.push('Publisher changed recently');
  }
  if (
    metadata.dormantMonths !== undefined &&
    metadata.dormantMonths > (policy.rules.publisher?.blockIfDormantMonths ?? 24)
  ) {
    score += policy.weights.publisher;
    triggered.push('Long dormancy detected');
  }

  if (
    metadata.lastUpdatedDaysAgo !== undefined &&
    metadata.lastUpdatedDaysAgo < (policy.rules.update?.highRiskRecentUpdateDays ?? 7)
  ) {
    score += policy.weights.update / 2;
    triggered.push('Recent update risk window');
  }
  if (
    metadata.dormantMonths !== undefined &&
    metadata.dormantMonths >= (policy.rules.update?.flagIfDormantMonths ?? 12)
  ) {
    score += policy.weights.update;
    triggered.push('No update in 12+ months');
  }
  if (metadata.majorVersionJumpAfterDormancy) {
    score += policy.weights.update;
    triggered.push('Major jump after dormancy');
  }

  if (
    metadata.installs !== undefined &&
    metadata.installs < (policy.rules.reputation?.minInstalls ?? 1000)
  ) {
    score += policy.weights.reputation / 2;
    triggered.push('Low install count');
  }
  if (
    metadata.rating !== undefined &&
    metadata.rating < (policy.rules.reputation?.minRating ?? 3)
  ) {
    score += policy.weights.reputation / 2;
    triggered.push('Low rating');
  }

  if (metadata.isObfuscated) {
    score += policy.weights.behaviour;
    triggered.push('Obfuscated code');
  }
  if (metadata.usesChildProcess) {
    score += policy.weights.behaviour / 3;
    triggered.push('Uses child_process');
  }
  if (metadata.usesEval) {
    score += policy.weights.behaviour / 3;
    triggered.push('Uses eval');
  }
  if (metadata.hasHardcodedIP) {
    score += policy.weights.behaviour / 3;
    triggered.push('Hard coded IP');
  }
  if (metadata.downloadsRemoteCode) {
    score += policy.weights.behaviour;
    triggered.push('Downloads remote code');
  }

  if (
    policy.rules.supplyChain?.requirePublicRepo &&
    metadata.hasPublicRepo === false
  ) {
    score += policy.weights.supplyChain;
    triggered.push('No public repository');
  }
  if (
    metadata.repoTransferredDaysAgo !== undefined &&
    metadata.repoTransferredDaysAgo < (policy.rules.supplyChain?.flagIfRepoTransferredRecentlyDays ?? 90)
  ) {
    score += policy.weights.supplyChain / 2;
    triggered.push('Recent repo transfer');
  }
  if (
    metadata.newMaintainerDaysAgo !== undefined &&
    metadata.newMaintainerDaysAgo < (policy.rules.supplyChain?.flagIfNewMaintainerDays ?? 60)
  ) {
    score += policy.weights.supplyChain / 2;
    triggered.push('New maintainer recently added');
  }

  const block = policy.thresholds?.block ?? 61;
  const review = policy.thresholds?.review ?? 31;
  let decision = 'ALLOW';
  if (score >= block) decision = 'BLOCK';
  else if (score >= review) decision = 'REVIEW';
  // No public repo (when required) always blocks
  if (
    policy.rules.supplyChain?.requirePublicRepo &&
    metadata.hasPublicRepo === false
  ) {
    decision = 'BLOCK';
  }

  return { score, decision, triggeredRules: triggered };
}

// Run as script: node lib/evaluate-extension.js
if (typeof require !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const policyPath = path.join(__dirname, '..', 'public', 'extension-safety-policy.json');
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));
  const metadata = {
    publisherVerified: true,
    publisherChangedDaysAgo: 20,
    dormantMonths: 30,
    lastUpdatedDaysAgo: 2,
    majorVersionJumpAfterDormancy: true,
    installs: 500,
    rating: 2.8,
    hasPublicRepo: false,
    usesChildProcess: true,
    usesEval: false,
    hasHardcodedIP: false,
    downloadsRemoteCode: true,
    isObfuscated: true,
  };
  const result = evaluateExtension(metadata, policy);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { evaluateExtension };
