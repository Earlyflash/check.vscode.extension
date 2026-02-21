/**
 * Tests for the extension safety evaluator.
 * Run: npm test (or node test/evaluate.test.js)
 * Uses lib/evaluate-extension.js and public/extension-safety-policy.json.
 */
const path = require('path');
const fs = require('fs');
const { evaluateExtension } = require('../lib/evaluate-extension.js');

const policyPath = path.join(__dirname, '..', 'public', 'extension-safety-policy.json');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));

const W = policy.weights;
const R = policy.rules;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasRule(result, ruleName) {
  return result.triggeredRules.includes(ruleName);
}

function runTest(name, metadata, expectedScore, expectedRules) {
  const result = evaluateExtension(metadata, policy);
  const rulesOk = expectedRules.every((r) => hasRule(result, r));
  const scoreOk = result.score === expectedScore;
  if (!scoreOk || !rulesOk) {
    throw new Error(
      `${name}: expected score=${expectedScore} and rules [${expectedRules.join(', ')}], ` +
        `got score=${result.score} and triggeredRules=[${result.triggeredRules.join(', ')}]`
    );
  }
  console.log('  OK:', name);
}

console.log('Policy weights:', W);
console.log('Policy thresholds:', policy.thresholds);
console.log('');

// ---- Publisher ----
console.log('Publisher rules:');
runTest(
  'Publisher changed recently (days ago < 90)',
  { publisherChangedDaysAgo: 50 },
  W.publisher,
  ['Publisher changed recently']
);
runTest(
  'Long dormancy detected (dormantMonths > 24) — also triggers No update in 12+ months (dormantMonths >= 12)',
  { dormantMonths: 30 },
  W.publisher + W.update,
  ['Long dormancy detected', 'No update in 12+ months']
);

// ---- Update ----
console.log('Update rules:');
runTest(
  'Recent update risk window (lastUpdatedDaysAgo < 7)',
  { lastUpdatedDaysAgo: 3 },
  W.update / 2,
  ['Recent update risk window']
);
runTest(
  'No update in 12+ months (dormantMonths >= 12)',
  { dormantMonths: 14 },
  W.update,
  ['No update in 12+ months']
);
runTest(
  'Major jump after dormancy',
  { majorVersionJumpAfterDormancy: true },
  W.update,
  ['Major jump after dormancy']
);

// ---- Reputation ----
console.log('Reputation rules:');
runTest(
  'Low install count (installs < 1000)',
  { installs: 500 },
  W.reputation / 2,
  ['Low install count']
);
runTest(
  'Low rating (rating < 3)',
  { rating: 2.5 },
  W.reputation / 2,
  ['Low rating']
);

// ---- Behaviour ----
console.log('Behaviour rules:');
runTest('Obfuscated code', { isObfuscated: true }, W.behaviour, ['Obfuscated code']);
runTest(
  'Uses child_process',
  { usesChildProcess: true },
  W.behaviour / 3,
  ['Uses child_process']
);
runTest('Uses eval', { usesEval: true }, W.behaviour / 3, ['Uses eval']);
runTest(
  'Hard coded IP',
  { hasHardcodedIP: true },
  W.behaviour / 3,
  ['Hard coded IP']
);
runTest(
  'Downloads remote code',
  { downloadsRemoteCode: true },
  W.behaviour,
  ['Downloads remote code']
);

// ---- Supply chain ----
console.log('Supply chain rules:');
runTest(
  'No public repository (hasPublicRepo === false)',
  { hasPublicRepo: false },
  W.supplyChain,
  ['No public repository']
);
const hasPublicRepoTrue = evaluateExtension({ hasPublicRepo: true }, policy);
assert(
  !hasRule(hasPublicRepoTrue, 'No public repository'),
  'hasPublicRepo: true must not trigger No public repository'
);
console.log('  OK: hasPublicRepo true does not trigger No public repository');
runTest(
  'Recent repo transfer (repoTransferredDaysAgo < 90)',
  { repoTransferredDaysAgo: 30 },
  W.supplyChain / 2,
  ['Recent repo transfer']
);
runTest(
  'New maintainer recently added (newMaintainerDaysAgo < 60)',
  { newMaintainerDaysAgo: 45 },
  W.supplyChain / 2,
  ['New maintainer recently added']
);

// ---- Combined and decision ----
console.log('Combined and decision:');
const combined = evaluateExtension(
  {
    hasPublicRepo: false,
    dormantMonths: 14,
    installs: 500,
    rating: 2.5,
  },
  policy
);
assert(hasRule(combined, 'No public repository'), 'combined: should have No public repository');
assert(hasRule(combined, 'No update in 12+ months'), 'combined: should have No update in 12+ months');
assert(hasRule(combined, 'Low install count'), 'combined: should have Low install count');
assert(hasRule(combined, 'Low rating'), 'combined: should have Low rating');
const expectedCombinedScore = W.supplyChain + W.update + W.reputation / 2 + W.reputation / 2;
assert(
  combined.score === expectedCombinedScore,
  `combined: expected score ${expectedCombinedScore}, got ${combined.score}`
);
assert(
  combined.decision === 'REVIEW' || combined.decision === 'BLOCK',
  `combined: decision should be REVIEW or BLOCK, got ${combined.decision}`
);
console.log('  OK: Combined metadata triggers multiple rules and correct decision');

// hasPublicRepo undefined must NOT trigger "No public repository" (strict check)
const noRepoUndefined = evaluateExtension({ hasPublicRepo: undefined }, policy);
assert(
  !hasRule(noRepoUndefined, 'No public repository'),
  'hasPublicRepo: undefined must not trigger No public repository (strict)'
);
console.log('  OK: hasPublicRepo undefined does not trigger (strict)');

console.log('');
console.log('All tests passed.');
