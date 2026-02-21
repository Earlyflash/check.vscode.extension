/**
 * Tests for GitHub repo trustworthiness evaluator.
 * Run: npm run test:repo (or node test/evaluate-repo.test.js)
 * Uses lib/evaluate-repo-extension.js and public/github-repo-safety-policy.json.
 */
const path = require('path');
const fs = require('fs');
const { evaluateRepo } = require('../lib/evaluate-repo-extension.js');

const policyPath = path.join(__dirname, '..', 'public', 'github-repo-safety-policy.json');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));

const W = policy.weights;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasRule(result, ruleName) {
  return result.triggeredRules.includes(ruleName);
}

console.log('GitHub repo policy weights:', W);
console.log('');

// Low stars
const lowStars = evaluateRepo({ stars: 5, forks: 2, openIssues: 1, ageDays: 200, daysSincePush: 10, contributorCount: 3 }, policy);
assert(hasRule(lowStars, 'Low star count'), 'should trigger Low star count');
assert(lowStars.score === W.engagement / 2, 'low stars score');
console.log('  OK: Low star count');

// Zero forks
const zeroForks = evaluateRepo({ stars: 100, forks: 0, openIssues: 2, ageDays: 200, daysSincePush: 5, contributorCount: 2 }, policy);
assert(hasRule(zeroForks, 'No or very few forks'), 'should trigger No or very few forks');
console.log('  OK: No or very few forks');

// High open issues
const highIssues = evaluateRepo({ stars: 100, forks: 10, openIssues: 60, ageDays: 500, daysSincePush: 20, contributorCount: 5 }, policy);
assert(hasRule(highIssues, 'High open issue count'), 'should trigger High open issue count');
console.log('  OK: High open issue count');

// High issues-to-stars ratio
const badRatio = evaluateRepo({ stars: 10, forks: 2, openIssues: 30, ageDays: 300, daysSincePush: 10, contributorCount: 2 }, policy);
assert(hasRule(badRatio, 'High open-issues-to-stars ratio'), 'should trigger ratio rule');
console.log('  OK: High open-issues-to-stars ratio');

// Very new repo
const newRepo = evaluateRepo({ stars: 50, forks: 5, openIssues: 0, ageDays: 30, daysSincePush: 1, contributorCount: 2 }, policy);
assert(hasRule(newRepo, 'Repo very new'), 'should trigger Repo very new');
console.log('  OK: Repo very new');

// Dormant repo
const dormant = evaluateRepo({ stars: 20, forks: 2, openIssues: 5, ageDays: 500, daysSincePush: 400, contributorCount: 1 }, policy);
assert(hasRule(dormant, 'Repo dormant (no recent push)'), 'should trigger dormant');
console.log('  OK: Repo dormant');

// Solo maintainer
assert(hasRule(dormant, 'Solo maintainer'), 'dormant has 1 contributor -> Solo maintainer');
console.log('  OK: Solo maintainer');

// No contributors
const noContrib = evaluateRepo({ stars: 5, forks: 0, openIssues: 10, ageDays: 100, daysSincePush: 50, contributorCount: 0 }, policy);
assert(hasRule(noContrib, 'No contributors listed'), 'should trigger No contributors listed');
console.log('  OK: No contributors listed');

// Unknown contributor count does not trigger
const unknownContrib = evaluateRepo({ stars: 5, forks: 0, openIssues: 1, ageDays: 200, daysSincePush: 10 }, policy);
assert(!hasRule(unknownContrib, 'No contributors listed'), 'undefined contributorCount should not trigger');
assert(!hasRule(unknownContrib, 'Solo maintainer'), 'undefined contributorCount should not trigger solo');
console.log('  OK: Unknown contributor count not penalized');

// Healthy repo: no rules
const healthy = evaluateRepo({
  stars: 100,
  forks: 20,
  openIssues: 5,
  ageDays: 400,
  daysSincePush: 10,
  contributorCount: 4,
}, policy);
assert(healthy.triggeredRules.length === 0, 'healthy repo should have no rules');
assert(healthy.score === 0 && healthy.decision === 'ALLOW', 'healthy score and decision');
console.log('  OK: Healthy repo passes');

console.log('');
console.log('All repo trust tests passed.');
