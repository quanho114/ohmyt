import {renderGoalRoundPrompt} from '../vendor/deepseek-goal/prompt.js';

// Same-session continuation consumer. SQLite admission supplies the checkpoint;
// the service owns durable state and process-local activation.
export class GoalRoundDriver {
  constructor(goals){this.goals=goals;}
  kick(sessionId){
    if(this.goals.tasks.has(sessionId))return this.goals.tasks.get(sessionId);
    const task=this.drive(sessionId);this.goals.tasks.set(sessionId,task);
    task.finally(()=>this.goals.tasks.delete(sessionId)).catch(()=>{});return task;
  }
  async drive(sessionId){
    await this.goals.host.ready;
    while(!this.goals.host.closing){
      const goal=this.goals.get(sessionId);if(goal?.phase!=='active'||goal.runtime.activation!=='armed')break;
      if(this.goals.host.inbox.list(sessionId).length){this.goals.interrupt(sessionId,'pending_human_input');break;}
      let round,error;
      try{
        round=this.goals.reserve(sessionId);
        const prompt=renderGoalRoundPrompt({objective:goal.objective,maxGoalRounds:goal.limits.rounds},goal.roundsStarted+1)[0].text;
        await this.goals.host.agentLoop.run({runId:round.runId,sessionId,prompt,goalRound:round,parentSignal:round.controller.signal,verifyTask:this.goals.verifiers.get(goal.id)});
      }catch(e){error=e;}
      if(!round){const latest=this.goals.get(sessionId);if(latest?.phase==='active')this.goals.change(sessionId,latest.revision,'blocked',g=>({...g,phase:'blocked',autoContinue:false,reason:'reservation_failed'}));break;}
      try{this.goals.settle(round,error);}finally{this.goals.rounds.delete(round.runId);}
      const next=this.goals.get(sessionId);if(next?.phase!=='active'||!next.autoContinue)break;
    }
  }
  async drain(sessionId){if(sessionId)await this.goals.tasks.get(sessionId);else await Promise.allSettled([...this.goals.tasks.values()]);}
}
