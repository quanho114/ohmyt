import {randomUUID} from 'node:crypto';

const boundedInteger=(value,min,max,label)=>{
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${label} must be an integer between ${min} and ${max}`);
  return value;
};

// Schedules are structured (never free-form cron) so validation and next-run
// math stay testable. All times are the daemon host's local time.
export function normalizeHabitSchedule(schedule){
  if(!schedule||typeof schedule!=='object'||Array.isArray(schedule))throw new Error('Invalid habit schedule');
  if(schedule.kind==='interval'){
    return {kind:'interval',minutes:boundedInteger(schedule.minutes,1,525600,'Habit interval minutes')};
  }
  if(schedule.kind==='daily'){
    return {kind:'daily',hour:boundedInteger(schedule.hour,0,23,'Habit hour'),minute:boundedInteger(schedule.minute,0,59,'Habit minute')};
  }
  if(schedule.kind==='weekly'){
    if(!Number.isSafeInteger(schedule.weekday)||schedule.weekday<0||schedule.weekday>6)throw new Error('Habit weekday must be 0-6 (0=Sunday)');
    return {kind:'weekly',weekday:schedule.weekday,hour:boundedInteger(schedule.hour,0,23,'Habit hour'),minute:boundedInteger(schedule.minute,0,59,'Habit minute')};
  }
  throw new Error('Habit schedule kind must be interval, daily or weekly');
}

// Event triggers share the habit substrate: a trigger fires its prompt into the
// session inbox when a run of the same session settles. Same-session only, and
// never on habit-sourced or goal rounds, so triggers cannot loop or hijack a
// durable goal chain.
export const HABIT_TRIGGER_KINDS = ['run_completed', 'run_failed'];
export function normalizeHabitTrigger(trigger){
  if(!trigger||typeof trigger!=='object'||Array.isArray(trigger))throw new Error('Invalid habit trigger');
  if(!HABIT_TRIGGER_KINDS.includes(trigger.kind))throw new Error(`Habit trigger kind must be one of: ${HABIT_TRIGGER_KINDS.join(', ')}`);
  return {kind:trigger.kind};
}

export function nextHabitRunAt(schedule,from){
  if(schedule.kind==='interval')return from+schedule.minutes*60000;
  const candidate=new Date(from);
  candidate.setHours(schedule.hour,schedule.minute,0,0);
  if(schedule.kind==='daily'){
    if(candidate.getTime()<=from)candidate.setDate(candidate.getDate()+1);
    return candidate.getTime();
  }
  const delta=(schedule.weekday-candidate.getDay()+7)%7;
  candidate.setDate(candidate.getDate()+delta);
  if(candidate.getTime()<=from)candidate.setDate(candidate.getDate()+7);
  return candidate.getTime();
}

// Fires due habits as durable queued inbox messages for their session. This is
// intentionally the only mechanism: scheduled runs are ordinary runs with the
// session's own scope, permissions and approval gates, so a habit can never
// widen authorization and pending approvals stay visible to the human.
export class HabitScheduler {
  constructor({db,inbox,pump,tickMs=30000}={}){
    this.db=db;this.inbox=inbox;this.pump=pump;this.tickMs=tickMs;
    this.timer=null;this.stopped=false;this.firing=false;
  }
  start(){
    if(this.stopped||this.timer)return;
    this.timer=setInterval(()=>{try{this.tick();}catch(error){console.error('Habit scheduler tick failed:',error.message);}},this.tickMs);
    this.timer.unref?.();
  }
  stop(){
    this.stopped=true;
    if(this.timer){clearInterval(this.timer);this.timer=null;}
  }
  tick(now=Date.now()){
    if(this.stopped||this.firing)return [];
    this.firing=true;
    const fired=[];
    try{
      for(const habit of this.db.dueHabits(now)){
        try{fired.push(this.fire(habit,now));}
        catch(error){
          console.error(`Habit ${habit.id} failed to enqueue:`,error.message);
          try{this.db.recordHabitRun(habit.id,{lastRunAt:now,lastStatus:'enqueue_failed',nextRunAt:nextHabitRunAt(habit.schedule,Math.max(now,habit.nextRunAt ?? now))});}catch{}
        }
      }
    }finally{this.firing=false;}
    return fired;
  }
  fire(habit,now=Date.now()){
    // The scheduled slot timestamp is the inbox idempotency key: a repeated
    // tick or a restart can never enqueue the same fire twice.
    const clientMessageId=`habit:${habit.id}:${habit.nextRunAt}`;
    const item=this.inbox.enqueue({sessionId:habit.sessionId,clientMessageId,kind:'queued',content:habit.prompt});
    const next=nextHabitRunAt(habit.schedule,Math.max(now,habit.nextRunAt ?? now));
    this.db.recordHabitRun(habit.id,{lastRunAt:now,lastStatus:'queued',lastInboxId:item.id,nextRunAt:next});
    this.pump?.(habit.sessionId);
    return {habitId:habit.id,inboxId:item.id,nextRunAt:next};
  }
  runNow(habitId,now=Date.now()){
    const habit=this.db.getHabit(habitId);
    if(!habit)throw new Error('Habit not found');
    const item=this.inbox.enqueue({sessionId:habit.sessionId,clientMessageId:`habit:${habit.id}:manual:${now}`,kind:'queued',content:habit.prompt});
    this.pump?.(habit.sessionId);
    return item;
  }
  // Same-session trigger evaluation. Runs sourced from this substrate and
  // durable goal rounds never fire triggers: the first prevents self-feeding
  // loops, the second keeps automatic goal chains under their own admission.
  onRunFinished({runId,status}){
    if(this.stopped||(status!=='completed'&&status!=='failed'))return [];
    if(typeof runId!=='string'||runId.startsWith('run_goal_'))return [];
    const sessionId=this.db.db.prepare('SELECT session_id FROM runs WHERE id=?').get(runId)?.session_id;
    if(!sessionId)return [];
    if(runId.startsWith('run_queue_')){
      const item=this.inbox.get(runId.slice('run_queue_'.length));
      if(item&&item.clientMessageId.startsWith('habit:'))return [];
    }
    const fired=[];
    for(const habit of this.db.habitsForTrigger(sessionId,`run_${status}`)){
      try{
        const item=this.inbox.enqueue({sessionId,clientMessageId:`habit:${habit.id}:trigger:${runId}`,kind:'queued',content:habit.prompt});
        this.db.recordHabitRun(habit.id,{lastRunAt:Date.now(),lastStatus:'queued',lastInboxId:item.id,nextRunAt:habit.nextRunAt});
        fired.push({habitId:habit.id,inboxId:item.id});
      }catch(error){console.error(`Habit trigger ${habit.id} failed to enqueue:`,error.message);}
    }
    if(fired.length)for(const {habitId} of fired)this.pump?.(sessionId);
    return fired;
  }
  // An assistant-owned habit fires into the assistant's main conversation,
  // creating it on first use with the assistant's default project. The binding
  // is durable: resetting chats never orphans the assistant's duties.
  resolveAssistantSession(assistantId){
    const agent=this.db.getAgent(assistantId);
    if(!agent)throw new Error(`Assistant not found: ${assistantId}`);
    let mainId=agent.main_session_id;
    if(mainId&&!this.db.getSession(mainId))mainId=null;
    if(!mainId){
      mainId=`duties_${assistantId}`;
      if(!this.db.getSession(mainId))this.db.createSession(mainId,assistantId,`${agent.name} duties`,agent.default_project_id || null);
      this.db.setAssistantWorkspace(assistantId,{mainSessionId:mainId});
    }
    return this.db.getSession(mainId);
  }
  createHabit({sessionId,assistantId,prompt,schedule,trigger}){
    if(assistantId!==undefined&&sessionId!==undefined)throw new Error('Choose either a session or an assistant, not both');
    if(assistantId!==undefined)sessionId=this.resolveAssistantSession(assistantId).id;
    if(!this.db.getSession(sessionId))throw new Error('Chat not found');
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>100000)throw new Error('Habit prompt must be text up to 100000 chars');
    if(schedule!==undefined&&trigger!==undefined)throw new Error('Choose either a schedule or a trigger, not both');
    if(schedule===undefined&&trigger===undefined)throw new Error('Habit needs a schedule or a trigger');
    const id='habit_'+randomUUID().slice(0,8);
    if(trigger!==undefined){
      const normalized=normalizeHabitTrigger(trigger);
      return this.db.createHabit(id,sessionId,prompt.trim(),{trigger:normalized.kind},null,'trigger',normalized.kind);
    }
    const normalized=normalizeHabitSchedule(schedule);
    return this.db.createHabit(id,sessionId,prompt.trim(),normalized,nextHabitRunAt(normalized,Date.now()),'schedule',null);
  }
  updateHabit(id,{prompt,schedule,trigger,enabled}={}){
    const habit=this.db.getHabit(id);
    if(!habit)throw new Error('Habit not found');
    const nextPrompt=prompt!==undefined?(typeof prompt==='string'&&prompt.trim()&&prompt.length<=100000?prompt.trim():null):undefined;
    if(prompt!==undefined&&!nextPrompt)throw new Error('Habit prompt must be text up to 100000 chars');
    const nextSchedule=schedule!==undefined?normalizeHabitSchedule(schedule):undefined;
    const nextTrigger=trigger!==undefined?normalizeHabitTrigger(trigger):undefined;
    if(enabled===false)return this.db.setHabitEnabled(id,false);
    if(enabled===true){
      const nextAt=habit.kind==='schedule'?nextHabitRunAt(nextSchedule ?? habit.schedule,Date.now()):habit.nextRunAt;
      return this.db.setHabitEnabled(id,true,nextAt);
    }
    if(nextSchedule!==undefined&&nextTrigger!==undefined)throw new Error('Choose either a schedule or a trigger, not both');
    if(nextSchedule!==undefined)return this.db.updateHabitDefinition(id,{prompt:nextPrompt,schedule:nextSchedule,nextRunAt:nextHabitRunAt(nextSchedule,Date.now()),kind:'schedule',triggerKind:null});
    if(nextTrigger!==undefined)return this.db.updateHabitDefinition(id,{prompt:nextPrompt,schedule:{trigger:nextTrigger.kind},nextRunAt:habit.nextRunAt,kind:'trigger',triggerKind:nextTrigger.kind});
    if(nextPrompt===undefined)return habit;
    return this.db.updateHabitDefinition(id,{prompt:nextPrompt});
  }
}
