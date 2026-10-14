import assert from 'node:assert/strict';
import {FramePublisher,type RenderClock} from '../src/framePublisher.ts';

let now=0,hidden=false,sequence=0;
const frames=new Map<number,()=>void>(),timers=new Map<number,()=>void>();
const clock:RenderClock={now:()=>now,hidden:()=>hidden,
 frame:callback=>{const id=++sequence;frames.set(id,callback);return id;},cancelFrame:id=>{frames.delete(id);},
 timer:callback=>{const id=++sequence;timers.set(id,callback);return id;},cancelTimer:id=>{timers.delete(id);}};
const values:string[]=[];
const publisher=new FramePublisher<string>(value=>values.push(value),clock);
const tick=(time:number)=>{now=time;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
for(let i=1;i<=400;i++)publisher.publish('token '.repeat(i),true);
assert.equal(frames.size,1,'A token burst schedules a single frame');
assert.equal(values.length,0);
tick(16);assert.equal(values.length,1);assert.equal(values[0],'token '.repeat(400));
publisher.publish('next text',true);tick(24);assert.equal(values.length,1,'Visible streaming commits are paced');
tick(48);assert.equal(values.at(-1),'next text');
publisher.publish('pending text',true);publisher.publish('completed');
assert.equal(values.at(-1),'completed','Lifecycle updates supersede pending output immediately');
tick(80);assert.equal(values.at(-1),'completed','A stale frame cannot resurrect old streaming state');
hidden=true;publisher.publish('hidden output',true);assert.equal(frames.size,0);assert.equal(timers.size,1);
const callbacks=[...timers.values()];timers.clear();now=200;callbacks.forEach(fn=>fn());
assert.equal(values.at(-1),'hidden output','Background output still advances');
publisher.publish('unmounted',true);publisher.cancel();assert.equal(timers.size,0);
assert.notEqual(values.at(-1),'unmounted');
console.log('PASS frame publisher: 400 updates → 1 commit, paced streaming, immediate boundaries, background and cleanup');
