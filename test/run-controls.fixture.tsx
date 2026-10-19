import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {api,type RunControls} from '../src/api.ts';
import {useRunControls} from '../src/harness/useRunControls.ts';
import {useUserInput} from '../src/harness/useUserInput.ts';
const pending:{sessionId:string;resolve:(value:RunControls)=>void}[]=[];
const mutations:(()=>void)[]=[];
api.getRunControls=sessionId=>new Promise(resolve=>pending.push({sessionId,resolve}));
api.cancelPendingMessage=()=>new Promise(resolve=>mutations.push(()=>resolve({ok:true})));
const answers:((value:Awaited<ReturnType<typeof api.answerUserInput>>)=>void)[]=[],continuations:unknown[]=[];
const answerFailures:((reason:Error)=>void)[]=[];
let pollFailure=false;
api.getUserInputs=async sessionId=>{if(pollFailure)throw Error('Temporary poll failure');return {requests:[{id:`question-${sessionId}`,runId:`run-${sessionId}`,sessionId,kind:'project',questions:[{id:'project',question:'Choose a project'}]}]};};
api.answerUserInput=()=>new Promise((resolve,reject)=>{answers.push(resolve);answerFailures.push(reject);});
(window as any).controlsFixture={pending,mutations,answers,continuations,setPollFailure:(value:boolean)=>{pollFailure=value;},resolve:(index:number,runId:string|null)=>pending[index].resolve({activeRunId:runId,state:runId?'running':'idle',messages:[]}),finish:()=>mutations.shift()?.(),finishAnswer:(index:number)=>answers[index]({ok:true,continuation:{projectId:'p',prompt:'Continue'}}),failAnswer:(index:number)=>answerFailures[index](Error('Answer failed'))};
function Fixture(){
 const [session,setSession]=useState('a');
 const controls=useRunControls(session);
 const input=useUserInput(session,value=>{continuations.push(value);});
 (window as any).controlsFixture.answer=()=>input.respond(input.requests[0],{projectId:'p'});
 return <><button onClick={()=>setSession(value=>value==='a'?'b':'a')}>Switch</button><button onClick={()=>void controls.cancel('pending')}>Cancel pending</button><output>{JSON.stringify({session,runId:controls.activeRunId,busy:controls.busy,inputBusy:input.busy,inputError:input.error,requests:input.requests.length})}</output></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
