import { useEffect, useRef, useState } from 'react';
import { api, type Goal } from '../api.ts';
import { GoalBar } from '../vendor/deepseek-goal/GoalBar.tsx';
import { TodoPanel } from '../vendor/deepseek-goal/TodoPanel.tsx';
import { en as goalEnglish, type GoalKey } from '../vendor/deepseek-goal/locales.ts';
import type {GoalActionResult, GoalSnapshot, TodoKey, TranslateNS} from '../vendor/deepseek-goal/contracts.ts';
import '../vendor/deepseek-goal/theme-bridge.css';

const goalVietnamese: Record<GoalKey,string> = {
  'phase.active':'Mục tiêu đang chạy','phase.active.disarmed':'Mục tiêu chưa chạy',
  'phase.paused':'Mục tiêu tạm dừng','phase.blocked':'Mục tiêu bị chặn',
  'objective.aria':'Nội dung Goal','commandInput.aria':'Lệnh nhập',
  'action.save':'Lưu Goal','action.cancel':'Hủy sửa','action.pause':'Tạm dừng Goal',
  'action.resume':'Tiếp tục Goal','action.edit':'Sửa Goal','action.clear':'Xóa Goal'
};
const todoCopy: Record<'vi'|'en',Record<TodoKey,string>> = {
  en:{'todo.title':'To-dos','todo.status.completed':'Completed','todo.status.inProgress':'In progress',
    'todo.status.pending':'Pending','todo.progress.done':'{done} completed',
    'todo.progress.active':'{active} in progress','todo.progress.pending':'{pending} pending'},
  vi:{'todo.title':'Công việc','todo.status.completed':'Hoàn thành','todo.status.inProgress':'Đang chạy',
    'todo.status.pending':'Đang chờ','todo.progress.done':'{done} hoàn thành',
    'todo.progress.active':'{active} đang chạy','todo.progress.pending':'{pending} đang chờ'}
};

// ohmyt owns durable actions; the vendored DeepSeek components own presentation.
export function MiniGoal({sessionId,locale,onRefresh}:{sessionId:string;locale:'vi'|'en';onRefresh?:()=>void}) {
  const [goal,setGoal] = useState<Goal|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const alive = useRef(true);
  const lock = useRef(false);
  const refresh = useRef(onRefresh);refresh.current=onRefresh;
  const en = locale==='en';
  useEffect(()=>{
    alive.current=true;let active=true;let previous:string|null=null;
    const load=async()=>{
      try {
        const result=await api.getGoal(sessionId);
        if(!active)return;
        setGoal(current=>current?.id===result.goal?.id && current && result.goal && current.revision>result.goal.revision?current:result.goal);
        setError('');
        const round=result.goal?.currentRound,key=round?`${round.runId}:${round.status}`:'';
        if(previous!==null && key!==previous)refresh.current?.();previous=key;
      }catch(e){if(active)setError(e instanceof Error?e.message:String(e));}
    };
    void load();const timer=window.setInterval(load,500);
    return()=>{active=false;alive.current=false;window.clearInterval(timer);};
  },[sessionId]);

  const perform=async(action:()=>Promise<Goal|null>):Promise<GoalActionResult>=>{
    if(lock.current)return {ok:false,error:{code:'busy',message:en?'An action is already running':'Một thao tác đang chạy'}};
    lock.current=true;setBusy(true);
    try {
      const next=await action();if(alive.current)setGoal(next);return {ok:true};
    }catch(e){return {ok:false,error:{code:'goal-action',message:e instanceof Error?e.message:String(e)}};}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  const control=(action:'pause'|'start'|'cancel'|'confirm')=>perform(async()=>{
    if(!goal)throw Error(en?'Goal unavailable':'Không tìm thấy Goal');
    return (await api.controlGoal(sessionId,action,goal.revision,action==='start'?true:undefined)).goal;
  });
  const edit=(objective:string)=>perform(async()=>{
    if(!goal)throw Error(en?'Goal unavailable':'Không tìm thấy Goal');
    if(goal.phase==='active')await api.controlGoal(sessionId,'pause',goal.revision);
    for(let attempt=0;attempt<100;attempt++){
      const latest=(await api.getGoal(sessionId)).goal;
      if(!alive.current)return null;
      if(!latest || latest.id!==goal.id)throw Error(en?'Goal changed; reopen the editor':'Goal đã thay đổi; mở lại phần sửa');
      try{return (await api.editGoal(sessionId,{objective,steps:latest.steps.map(s=>({...s})),expectedRevision:latest.revision})).goal;}
      catch(e){
        if(attempt===99 || !(e instanceof Error) || !/active round|revision conflict/i.test(e.message))throw e;
        await new Promise<void>(resolve=>window.setTimeout(resolve,100));
      }
    }
    throw Error(en?'Could not save goal':'Không lưu được Goal');
  });
  const extraAction=async(action:'start'|'confirm')=>{
    const result=await control(action);if(!result.ok && alive.current)setError(result.error.message);
  };
  if(!goal)return error?<p role="alert" className="mb-2 text-xs text-red-500">{error}</p>:null;
  if(goal.phase==='cancelled' || goal.phase==='completed')return null;
  const snapshot:GoalSnapshot={id:goal.id,revision:goal.revision,objective:goal.objective,
    phase:goal.phase==='review_required'?'blocked':goal.phase,
    ...(goal.reason?{blockedReason:{message:goal.reason}}:{})};
  const t:TranslateNS<'goal'>=key=>key==='phase.blocked' && goal.phase==='review_required'
    ? (en?'Ready for review':'Chờ xác nhận kết quả') : (en?goalEnglish:goalVietnamese)[key];
  const todoT:TranslateNS<'conversation'>=(key,values)=>{
    let text=todoCopy[locale][key];
    for(const [name,value] of Object.entries(values||{}))text=text.replace(`{${name}}`,String(value));
    return text;
  };
  const todos=goal.steps.map(step=>({id:step.id,content:step.text,status:step.status==='done'?'completed' as const:step.status}));
  return <div className="deepseek-goal-stack" data-mini-goal={goal.phase}>
    {todos.some(todo=>todo.status!=='completed') && <TodoPanel todos={todos} t={todoT}/>}
    <GoalBar goal={snapshot} activation={goal.phase==='active'?'armed':'disarmed'} t={t}
      onEdit={edit} onPause={()=>control('pause')} onResume={()=>control('start')} onClear={()=>control('cancel')}/>
    {goal.phase==='review_required' && <div className="deepseek-goal-extra"><span>{en?'Check the result before completing':'Kiểm tra kết quả trước khi hoàn thành'}</span><button type="button" disabled={busy} aria-label={en?'I checked the result, complete':'Tôi đã kiểm tra, hoàn thành'} onClick={()=>void extraAction('confirm')}>{en?'Confirm result':'Xác nhận kết quả'}</button></div>}
    {goal.phase==='blocked' && <div className="deepseek-goal-extra"><span>{goal.reason|| (en?'Needs attention':'Cần xử lý')}</span><button type="button" disabled={busy} aria-label={en?'Resume goal':'Tiếp tục Goal'} onClick={()=>void extraAction('start')}>{en?'Retry goal':'Chạy lại Goal'}</button></div>}
    {goal.phase==='paused' && (goal as Goal & {waitingForInput?:boolean}).waitingForInput && <div className="deepseek-goal-extra" role="status"><span>{en?'Waiting for your answer: ':'Đang chờ bạn trả lời: '}{goal.reason}</span></div>}
    {error && <p role="alert" className="deepseek-goal-extra">{error}</p>}
  </div>;
}
