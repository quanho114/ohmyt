import assert from 'node:assert/strict';
import {createDaemon} from '../server/index.js';
const entered=Promise.withResolvers(),gate=Promise.withResolvers();let replacementInput;
const d=createDaemon({dbPath:':memory:',port:0,pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:async o=>{
 if(o.messages.at(-1)?.content==='old request'){entered.resolve();await gate.promise;o.onChunk('OLD LATE ANSWER');return {completed:true};}
 replacementInput=o.messages;o.onChunk('NEW ANSWER');return {completed:true};
}});}}}});await d.start();d.db.createSession('s',d.db.getAgents()[0].id,'Fixed title');
try{
 const old=d.agentLoop.run({runId:'old',sessionId:'s',prompt:'old request'});await entered.promise;
 const next=d.harness.inbox.enqueue({sessionId:'s',clientMessageId:'new',kind:'queued',content:'new request'});
 d.agentLoop.sendInboxNow('s',next.id);gate.resolve();await old;
 for(let i=0;i<100&&!replacementInput;i++)await new Promise(r=>setTimeout(r,10));
 await Promise.allSettled([...d.agentLoop.pendingRuns]);assert(replacementInput);
 assert(!replacementInput.some(m=>m.content==='old request'),'superseded request must not remain an unanswered model task');
 assert(!d.db.getRunEvents('old').some(e=>e.event_type==='TextDelta'&&JSON.parse(e.payload).delta==='OLD LATE ANSWER'),'cancelled stream cannot publish late answer');
 assert.equal(d.db.getMessages('s').filter(m=>m.sender==='agent').at(-1).content,'NEW ANSWER');
}finally{gate.resolve();await d.stop();}
console.log('Send now replaces old model task and drops late cancelled output');
