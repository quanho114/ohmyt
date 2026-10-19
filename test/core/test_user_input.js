import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {harnessFixture} from '../harness_fixture.js';
import {PermissionEngine} from '../../server/permissions.js';
let received;
const d=await harnessFixture({stream:async({messages,tools,onToolCall,onChunk})=>{
  const turn=messages.slice(messages.findLastIndex(m=>m.role==='user')),result=turn.find(m=>m.role==='tool');
  if(result){received=JSON.parse(result.content);onChunk(`Draft for ${JSON.stringify(received.answers)}`);}
  else if(turn[0]?.content==='project')onToolCall({id:'project',name:'request_project',arguments:{question:'Bạn muốn tìm hiểu thư mục nào?'}});
  else if(turn[0]?.content==='bad schema')onToolCall({id:'ask',name:'request_user_input',arguments:{questions:[{id:'same',question:'One'},{id:'same',question:'Two'}]}});
  else{assert(tools.some(tool=>tool.name==='request_user_input'));onToolCall({id:'ask',name:'request_user_input',arguments:{questions:[{id:'recipient',question:'Email gửi cho ai?',options:['Khách hàng','Đồng nghiệp']},{id:'purpose',question:'Bạn muốn nói điều gì?'}]}});}
  return {completed:true};
}});
d.permissions.evaluate=PermissionEngine.prototype.evaluate.bind(d.permissions);
const {port}=await d.start(),base=`http://127.0.0.1:${port}`;
const answer=(run,id,body)=>fetch(`${base}/api/runs/${run}/user-input/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function start(id,prompt='Soạn email'){
  d.db.createSession(id,'fixture','Explicit title');d.db.db.prepare('UPDATE sessions SET workflow_id=? WHERE id=?').run('email-draft',id);
  let ready;const pending=new Promise(resolve=>{ready=resolve;});
  const listener=event=>{if(event.runId===id&&event.type==='UserInputRequired')ready(event.payload.requestId);};
  d.agentLoop.on('event',listener);const running=d.agentLoop.run({runId:id,sessionId:id,prompt});
  const requestId=await Promise.race([pending,running.then(()=>{throw Error('Run ended without requesting input');})]);
  d.agentLoop.off('event',listener);return {requestId,running};
}
try{
  assert.equal((await (await fetch(`${base}/api/harness`)).json()).userInputVersion,1);
  const first=await start('questions');
  const listed=await (await fetch(`${base}/api/sessions/questions/user-input`)).json();
  assert.equal(listed.requests.length,1);assert.equal(listed.requests[0].questions.length,2);
  assert.equal(d.db.db.prepare('SELECT status FROM runs WHERE id=?').get('questions').status,'running');
  assert.equal((await answer('wrong-run',first.requestId,{text:'bypass'})).status,409);
  assert.equal((await answer('questions',first.requestId,{answers:[{id:'recipient',answer:'Linh'}]})).status,400);
  assert.equal(d.harness.userInputs.list('questions').length,1);
  const reference={scope:'questions',path:'Report.md',grantId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',version:'a'.repeat(64)};
  const snapshot=`Reference: ${JSON.stringify(reference)}\nContent: newly opened document`;
  assert.equal((await fetch(`${base}/api/document-context`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'questions',key:'new-document',text:snapshot})})).status,200);
  const reader=d.harness.runContexts.get('questions').runTools.get('read_open_documents');
  assert.match((await reader.execute({path:'Report.md'},{sessionId:'questions'})).content,/newly opened/);
  assert.throws(()=>reader.execute({path:'Report.md'},{sessionId:'wrong-chat'}),/not open/);
  assert.equal((await answer('questions',first.requestId,{answers:[{id:'recipient',answer:'Chị Linh'},{id:'purpose',answer:'Xin dời lịch họp'}]})).status,200);
  await first.running;assert.deepEqual(received.answers,[{id:'recipient',answer:'Chị Linh'},{id:'purpose',answer:'Xin dời lịch họp'}]);
  assert.equal(received.openDocuments[0].path,'Report.md');
  assert.equal(d.harness.userInputs.list('questions').length,0);
  assert.equal((await answer('questions',first.requestId,{text:'duplicate'})).status,409);
  assert.equal(d.db.db.prepare('SELECT status FROM runs WHERE id=?').get('questions').status,'completed');
  const text=await start('text');assert.equal((await answer('text',text.requestId,{text:'Gửi chị Linh, xin dời lịch họp sang thứ Sáu.'})).status,200);
  await text.running;assert.match(received.answers[0].answer,/chị Linh/);
  const cancelled=await start('cancelled');d.agentLoop.abortRun('cancelled');await cancelled.running;
  assert.equal(d.harness.userInputs.list('cancelled').length,0);assert.equal((await answer('cancelled',cancelled.requestId,{text:'late'})).status,409);
  d.db.createSession('invalid','fixture','Explicit title');await d.agentLoop.run({runId:'invalid',sessionId:'invalid',prompt:'bad schema'});
  assert.equal(d.harness.userInputs.list('invalid').length,0);
  const root=path.join(d.fixtureRoot,'project');fs.mkdirSync(root);d.db.addProject('selected-project','Chosen project',root);
  const project=await start('project','project');assert.equal((await answer('project',project.requestId,{projectId:'missing'})).status,400);
  const continuation=await (await answer('project',project.requestId,{projectId:'selected-project'})).json();await project.running;
  assert.deepEqual(continuation.continuation,{projectId:'selected-project',prompt:'project',workflowId:'email-draft'});
  assert.equal(d.db.getSession('project').project_id,null);assert.equal(d.db.db.prepare('SELECT status FROM runs WHERE id=?').get('project').status,'aborted');
  const closing=await start('closing');await d.closeFixture();await closing.running;
  console.log('PASS user input: tool→HTTP→same-turn continuation, free text, invalid/stale/wrong-run answers, cancellation, project selection and shutdown drain');
}finally{if(!d.harness.closed)await d.closeFixture();}
