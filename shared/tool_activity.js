// Compatibility events used a success boolean; canonical receipts also expose
// uncertainty, which must never look like a confirmed failure or completion.
export function completedToolStatus({executionStatus,success,output}){
  if(executionStatus==='unknown'||output?.code==='TOOL_OUTCOME_UNKNOWN')return 'unknown';
  if(executionStatus==='denied'||executionStatus==='cancelled')return 'blocked';
  return success?'completed':'error';
}
