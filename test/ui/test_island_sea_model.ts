import assert from 'node:assert/strict';
import {advance,canSail,landmarks,nearby,parseJournal,start} from '../../src/islandSea/world.ts';
assert(canSail(start));
for(const point of landmarks){assert(canSail(point),point.id);assert.equal(nearby(point)?.id,point.id);}
let position={...start};for(let i=0;i<500;i++)position=advance(position,1,1,.04);assert(canSail(position));
assert(Math.hypot(advance(start,1,0,100).x-start.x,0)<.01,'large elapsed time is clamped');
assert.deepEqual(parseJournal('{"version":1,"discoveries":["birds","birds","invalid",1]}'),['birds']);
assert.deepEqual(parseJournal('{bad'),[]);assert.deepEqual(parseJournal('{"version":99,"discoveries":["birds"]}'),[]);
const visited=new Set<string>(),queue=[start];
for(let i=0;i<queue.length;i++){
 const p=queue[i],key=`${Math.round(p.x*100)},${Math.round(p.y*100)}`;
 if(visited.has(key))continue;visited.add(key);
 for(const [dx,dy] of [[.01,0],[-.01,0],[0,.01],[0,-.01]]){const n={x:Math.round((p.x+dx)*100)/100,y:Math.round((p.y+dy)*100)/100};if(canSail(n)&&!visited.has(`${Math.round(n.x*100)},${Math.round(n.y*100)}`))queue.push(n);}
}
for(const landmark of landmarks)assert(visited.has(`${Math.round(landmark.x*100)},${Math.round(landmark.y*100)}`),`reachable ${landmark.id}`);
console.log('PASS island sea model: safe landmarks, coast collision, bounded timestep and journal validation');
