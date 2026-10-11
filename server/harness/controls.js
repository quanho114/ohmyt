export function controlRun(host,runId,action){
  const handle=host.agents.findRun(runId);if(!handle)throw new Error('Run is no longer active');
  if(action==='pause')handle.pause();else if(action==='resume')handle.resume();else throw new Error('Invalid run control');
  return {runId,state:handle.state};
}
