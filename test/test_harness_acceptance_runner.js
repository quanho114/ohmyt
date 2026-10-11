import assert from 'node:assert/strict';
import * as acceptance from './evals/harness/architecture_acceptance.js';
assert.equal(typeof acceptance.runAcceptance,'function','acceptance runner must report failures');
const records=[];
assert.equal(await acceptance.runAcceptance({cases:[{scenario:'intentional-failure',args:['--eval','process.exit(3)']}],record:r=>records.push(r)}),1);
assert.equal(records[0].status,'failed');assert.equal(records[0].errorCode,'EXIT_3');assert.equal(Object.hasOwn(records[0],'output'),false);
assert.equal(await acceptance.runAcceptance({cases:[{scenario:'intentional-pass',args:['--eval','process.exit(0)']}],record:r=>records.push(r)}),0);
assert.equal(records[1].status,'passed');console.log('Acceptance runner propagates nonzero exit and records redacted outcomes');
