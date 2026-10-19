import {GoalService} from '../vendor/deepseek-goal/service.js';
import {emptyGoalFoldState,applyGoalChange,decodeGoalChange} from '../vendor/deepseek-goal/fold.js';

// Run upstream's synchronous domain mutation against a detached projection.
// The caller commits the proposal with the SQLite CAS and turn commit barrier;
// plan, usage and verification remain ohmyt sidecars, not upstream snapshot fields.
export function proposeGoalTransition(goal, operation, request = {}, activation = 'disarmed') {
  const now = Date.now();
  const phase = goal?.phase === 'completed' ? 'complete'
    : ['review_required','cancelled'].includes(goal?.phase) ? 'blocked' : goal?.phase;
  let current = goal ? {goal:{id:goal.id,revision:goal.revision,objective:goal.objective,
    phase,maxGoalRounds:goal.limits.rounds,
    ...(phase==='blocked'?{blockedReason:{code:'host-blocked',message:goal.reason || 'Needs review'}}:{})},
    roundsStarted:goal.roundsStarted,createdAt:goal.createdAt ?? now,updatedAt:goal.updatedAt ?? now} : null;
  let change;
  const session = {id:goal?.sessionId || 'new',seq:0,append(type,data) {
    const state = emptyGoalFoldState();
    if(current) {state.goal=current.goal;state.roundsStarted=current.roundsStarted;
      state.createdAt=current.createdAt;state.updatedAt=current.updatedAt;state.seenGoalIds.add(current.goal.id);}
    applyGoalChange(state,decodeGoalChange(data));
    change=data;
    current=state.goal?{goal:state.goal,roundsStarted:state.roundsStarted,createdAt:state.createdAt,updatedAt:state.updatedAt}:null;
    return {type,data,seq:this.seq++};
  }};
  const agent={id:'ohmyt-domain',session};
  const ctx={agents:{get:id=>id===agent.id?agent:undefined},
    sessionProjections:{stateOf:()=>({current,failure:null})},emit(){}};
  const service=new GoalService(ctx);
  service.setActivation(session,activation);
  const ref=goal?{id:goal.id,revision:goal.revision}:null;
  const view=operation==='create'?service.create(agent,request)
    : operation==='edit'?service.edit(agent,ref,request)
    : operation==='block'?service.block(agent,ref,request)
    : service[operation](agent,ref);
  return {view,change};
}
