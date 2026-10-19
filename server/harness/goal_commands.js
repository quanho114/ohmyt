import {parseGoalCommand} from '../../shared/goal_command.js';

// Direct human command plane: controls never become a model prompt or objective.
export async function executeGoalCommand(goals,sessionId,{input,expectedRevision}={}){
 if(typeof input!=='string'||input.length>4100||!/^\/goal(?:\s|$)/i.test(input))throw new Error('Invalid Goal command');
 const command=parseGoalCommand(input.replace(/^\/goal\s*/i,'')),goal=goals.get(sessionId);
 if(command.kind==='show')return {goal};
 if(command.kind==='invalid-edit')throw new Error('Use /goal edit <objective>');
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==(goal?.revision || 0))throw Object.assign(new Error('Goal revision conflict'),{code:'GOAL_REVISION_CONFLICT'});
 if(command.kind==='clear'&&(!goal||goal.phase==='cancelled'))return {goal};
 if(command.kind==='create'){
  if(goals.host.agents.sessionOwners.has(sessionId)||goals.tasks.has(sessionId))throw new Error('Wait for the active round to settle');
  if(!goals.host.ctx.tools.get('goal_progress'))throw new Error('Planning is disabled');
  const created=goals.create(sessionId,{objective:command.objective,expectedRevision});
  return {goal:goals.control(sessionId,{action:'start',expectedRevision:created.revision,autoContinue:true})};
 }
 if(!goal)throw new Error('Goal unavailable');
 if(command.kind==='edit')return {goal:goals.edit(sessionId,{objective:command.objective,expectedRevision})};
 const action=command.kind==='pause'?'pause':command.kind==='resume'?'start':'cancel';
 return {goal:goals.control(sessionId,{action,expectedRevision,autoContinue:action==='start'?true:undefined})};
}
