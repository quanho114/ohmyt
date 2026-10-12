import assert from 'node:assert/strict';
import {springStep} from '../src/chatMotion.ts';
import {cadenceFadeMs} from '../src/streamAnimation.ts';
for (const hz of [30,60,120]) {
  let position=0, velocity=0;
  for (let i=0;i<hz;i++) {
    const next=springStep(position,velocity,300,1000/hz);
    assert(next.position>=position && next.position<=300,'following must be monotonic and bounded');
    ({position,velocity}=next);
  }
  assert(Math.abs(position-300)<.01,'spring must settle at every supported frame rate');
}
assert.equal(springStep(100,0,100,16).position,100);
assert.equal(cadenceFadeMs(0,0).duration,120);
assert.equal(cadenceFadeMs(160,60000).duration,400);
console.log('PASS spring convergence, bounded movement and cadence after stalls');
