import assert from 'node:assert/strict';
import { AppDatabase } from '../server/db.js';
import { AgentLoop, isProgressOnlyReply } from '../server/agent_loop.js';
assert(isProgressOnlyReply('Tôi sẽ kiểm tra tác giả.Tôi sẽ kiểm tra commit đầu tiên.'));
assert(!isProgressOnlyReply('Tác giả commit gồm Ho Minh Quan và Antigravity Agent.'));
const db = new AppDatabase(':memory:');
try {
 for (const mode of ['answer', 'stuck', 'empty', 'direct', 'resume-tools']) {
  db.createSession(mode, 'default-assistant', 'Manual conversation');
  let turns = 0;
  const events = [];
  const loop = new AgentLoop({db, permissions: {evaluate: () => ({action:'ALLOW'})}, skills:{},
   tools:{forStandalone(){return this;},getAllDefinitions:()=>[{name:'shell_exec'}],validateCall:call=>({arguments:call.arguments,tool:{execute:async()=>({success:true,stdout:'Ho Minh Quan\nAntigravity Agent'})}})},
   llm:{streamChat:async opts=>{
    turns++;
    if (mode === 'direct') opts.onChunk('Xin chào bạn!');
    else if (turns === 1) { opts.onChunk('Tôi sẽ kiểm tra tác giả.'); opts.onToolCall({id:'git',name:'shell_exec',arguments:{command:'git log'}}); }
    else if (turns === 2 && mode !== 'empty') opts.onChunk('Tôi sẽ kiểm tra commit đầu tiên.');
    else if (mode === 'stuck') {
     assert.equal(opts.tools.length,turns === 6 ? 0 : 1);
     opts.onChunk('Tôi sẽ kiểm tra tác giả.');
    }
    else if (turns === 3) {
     assert.equal(opts.tools.length,1);
     if (mode === 'resume-tools') {
      opts.onToolCall({id:'lookup',name:'shell_exec',arguments:{command:'git log'}});
      return {completed:true};
     }
     assert(opts.messages.some(message=>message.content.includes('Ho Minh Quan')));
     opts.onChunk('Tác giả commit gồm Ho Minh Quan và Antigravity Agent.');
    }
    if (mode === 'resume-tools' && turns === 4) opts.onChunk('Tác giả commit gồm Ho Minh Quan và Antigravity Agent.');
    return {completed:true};
   }}});
  loop.on('event',event=>events.push(event));
  await loop.run({runId:mode,sessionId:mode,prompt:'Ai là tác giả?'});
  const saved = db.getMessages(mode).at(-1);
  if (mode === 'stuck') {assert(events.some(e=>e.type==='RunFailed'));assert(saved.content.includes('chưa đưa ra câu trả lời'));}
  else {assert(events.some(e=>e.type==='RunCompleted'));assert.equal(saved.content,mode==='direct'?'Xin chào bạn!':'Tác giả commit gồm Ho Minh Quan và Antigravity Agent.');}
  let live='';for(const e of events) {if(e.type==='TextReset') live='';if(e.type==='TextDelta') live+=e.payload.delta;}
  if(mode !== 'stuck') assert.equal(live,saved.content);
  assert.equal(turns,mode==='direct'?1:mode==='stuck'?6:mode==='resume-tools'?4:3);
 }
 console.log('✓ Conclusions: progress-only recovery, empty reply recovery, bounded failure, factual final text and live resets');
} finally {db.close();}
