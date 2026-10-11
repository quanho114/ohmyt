import {freezeValue} from './prompt.js';
import {validateToolResult} from './contracts.js';
export function toolResult(callId,status,output,startedAt){
  return freezeValue(validateToolResult({callId,status,modelContent:typeof output==='string'?output:JSON.stringify(output ?? null),artifactRefs:[],executionReceipt:{status,startedAt,endedAt:Date.now()},output}));
}
