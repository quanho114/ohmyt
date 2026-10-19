import assert from 'node:assert/strict';
import {creatures,lifePose,projectPoint,Wake,BirdFlight} from '../../src/islandSea/life.ts';
import {landmarks,canSail} from '../../src/islandSea/world.ts';
for(const kind of creatures){
 const far={x:.5,y:.5},a=lifePose(kind,0,far),b=lifePose(kind,2,far);
 assert(a.x!==b.x||a.y!==b.y||a.frame!==b.frame,`${kind} moves independently`);
 const close=landmarks.find(l=>l.id===kind)!;
 assert(lifePose(kind,2,close).reacting,`${kind} reacts to approaching boat`);
 assert(lifePose(kind,2,far,true).reacting,`${kind} reacts to interaction`);
}
for(let t=0;t<20;t+=.1)assert(canSail(lifePose('shark',t,{x:.035,y:.04},true)),'shark stays in navigable water');
const wake=new Wake();wake.step({x:100,y:100},0,true);
for(let i=0;i<50;i++)wake.step({x:100+i*2,y:100},.05,true);
assert(wake.particles.length>0&&wake.particles.length<=40);
assert(Math.abs(wake.particles.at(-1)!.angle)<.001,'foam follows direction of travel');
for(let i=0;i<40;i++)wake.step({x:198,y:100},.05,false);
assert.equal(wake.particles.length,0,'anchored boat does not emit travelling wake');
wake.reset();assert.equal(wake.particles.length,0);
assert.deepEqual(projectPoint({x:.5,y:.5},100,200,true),{x:50,y:100});
console.log('PASS sea life: independent poses, proximity/click reactions, navigable shark, directional bounded wake and decay');

const flight=new BirdFlight();
let previous=flight.step(0,0,{x:.9,y:.8},false),flips=0;
for(let i=1;i<1200;i++){
 const time=i/30,reacting=i>=100&&i<550;
 const next=flight.step(1/30,time,{x:.7,y:.7},reacting);
 assert(Math.hypot(next.x-previous.x,next.y-previous.y)<=.055/30+.00001,'no teleport when interest changes');
 if(next.flip!==previous.flip)flips++;
 previous=next;
}
assert(flips<12,'facing does not flicker each frame');
const before=flight.step(0,40,{x:.2,y:.2},true);
const stopped=flight.step(.04,41,{x:.2,y:.2},true,false);
assert.equal(stopped.x,before.x);assert.equal(stopped.y,before.y);
console.log('PASS continuous bird steering, limited speed, stable facing, pause and reduced motion');
