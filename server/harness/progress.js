import {canonicalize} from '../vendor/deepseek-harness/context_utils.js';
import {createHash} from 'node:crypto';

// Exact observed repeats only. This never classifies arbitrary shell commands as
// read-only, suppresses tool effects, or claims a different call has succeeded.
export function observeProgress(state,calls,outcomes) {
  let repeated=false;
  for(const call of calls){
    const result=outcomes.get(call.id);
    if(result?.status!=='success')continue;
    const key=JSON.stringify([call.name,canonicalize(call.arguments)]);
    const digest=createHash('sha256').update(JSON.stringify(result.output ?? result.modelContent)).digest('hex');
    const previous=state.get(key);
    const count=previous?.digest===digest?previous.count+1:1;
    state.set(key,{digest,count});
    if(count===3)repeated=true;
  }
  return repeated;
}

// Adapted chain semantics from DeepSeek repeat-tool-reminder. Advisory only:
// different results are not declared stalled and no tool execution is skipped.
export function observeToolRepeats(state,calls,outcomes) {
  const notices=[];
  for(const call of calls){
    if(!outcomes.has(call.id))continue;
    const argumentsText=canonicalize(call.arguments);
    const key=JSON.stringify([call.name,argumentsText]);
    state.count=state.key===key?state.count+1:1;state.key=key;
    if(![3,5,8].includes(state.count))continue;
    notices.push(`Repeated tool call: ${call.name} × ${state.count}. The arguments are identical after JSON key normalization. Inspect the recorded call and result before repeating. If the result changes, continued polling may be justified; otherwise reuse evidence or choose a different approach. A denial remains a denial; an unknown outcome requires verification, never automatic replay. This reminder grants no permissions and does not establish completion.`);
  }
  return notices;
}
