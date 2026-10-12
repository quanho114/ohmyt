import {freezeValue} from './prompt.js';

// Protocol settlement and tool success cannot establish that a user objective was met.
// Only an admitted, host-owned verifier can supply task-level verification evidence.
export function taskOutcome({protocolStatus='completed',results=[],stopReason=null,verification=null}={}){
  const evidenceRefs=Array.isArray(verification?.evidenceRefs)?[...new Set(verification.evidenceRefs.filter(ref=>typeof ref==='string'&&ref.trim()&&ref.length<=1000))].slice(0,100):[];
  results=results.map(result=>result.name==='subagent_wait'&&['partial','blocked','failed','unknown'].includes(result.output?.status)?{...result,status:result.output.status==='blocked'?'denied':result.output.status==='unknown'?'unknown':'error'}:result);
  const optional=new Set(verification?.optionalCallIds || []),resolved=new Set(verification?.verified===true?verification.resolvedCallIds || []:[]);
  const successes=results.filter(r=>r.status==='success');
  const goalControls=new Set(['get_goal','create_goal','update_goal','goal_start','goal_progress']);
  const unresolved=results.filter(r=>r.status!=='success'&&!optional.has(r.callId)&&!resolved.has(r.callId)).filter(r=>{
    // A corrected local goal revision/validation error is not an unresolved external action.
    if(r.status==='error'&&goalControls.has(r.name)&&['GOAL_REVISION_CONFLICT','GOAL_INCOMPLETE_PLAN'].includes(r.output?.code)&&successes.some(s=>s.name===r.name))return false;
    // Schema correction is safe only when the rejected body never ran and the same tool later succeeded.
    return !(r.executionReceipt?.bodyStarted===false&&r.output?.code==='INVALID_ARGS'&&successes.some(s=>s.name===r.name));
  });
  const uncertain=unresolved.some(r=>r.status==='unknown');
  const blocked=Boolean(stopReason)||unresolved.some(r=>r.status==='denied');
  let taskStatus=uncertain?'unknown':blocked?'blocked':unresolved.length?(successes.length?'partial':'failed'):results.length?'unknown':'completed';
  let verificationStatus=results.length?'unverified':'not_applicable';
  if(protocolStatus!=='completed'){taskStatus=protocolStatus==='cancelled'||uncertain?'unknown':blocked?'blocked':'failed';verificationStatus='unverified';}
  if(verification){
    verificationStatus='unverified';
    if(verification.verified===true&&evidenceRefs.length&&protocolStatus==='completed'&&!blocked&&!unresolved.length){taskStatus='completed';verificationStatus='verified';}
    else if(verification.verified===false&&!blocked&&!unresolved.length)taskStatus='failed';
  }
  return freezeValue({version:1,protocolStatus,taskStatus,verificationStatus,
    evidenceRefs:verificationStatus==='verified'?evidenceRefs:[],
    unresolvedCallIds:[...new Set(unresolved.map(r=>r.callId))],stopReason});
}
