import assert from 'node:assert/strict';
import {validateManifest,parseProfile,resolveProfile} from '../../server/harness/manifests.js';
assert.throws(()=>validateManifest({id:'bad space',version:1}),/manifest/);
assert.equal(parseProfile('id: default\nversion: 1\nplugins: []\nbudgets:\n  maxSteps: 5\n').id,'default');
assert.throws(()=>parseProfile('id: x\nversion: 1\nunknown: true'),/Unknown/);
assert.throws(()=>parseProfile('id: x\nversion: 1\nplugins: []\nplugins: []'),/unique|duplicate/i);
assert.equal(resolveProfile({id:'default',version:1,budgets:{maxSteps:5}},{budgets:{maxSteps:8}},{budgets:{maxSteps:10}}).budgets.maxSteps,10);
console.log('Manifest and YAML profile validation passed');

assert.equal(parseProfile('id: adaptive\nversion: 1\nbudgets:\n  maxSteps: 0\n  browserMaxSteps: 0\n  maxRequests: 100\n  maxToolCalls: 100\n').budgets.maxSteps,0);
