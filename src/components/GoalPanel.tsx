import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {api,type Goal} from '../api.ts';

export function GoalPanel({sessionId,locale,onRefresh,openRequest,onClose}:{sessionId:string;locale:'vi'|'en';onRefresh:()=>void;openRequest:number;onClose:()=>void}){
  const en=locale==='en',t=(vi:string,english:string)=>en?english:vi;
  const [open,setOpen]=useState(false),[goal,setGoal]=useState<Goal|null>(null),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false),[editing,setEditing]=useState(false);
  const [objective,setObjective]=useState(''),[plan,setPlan]=useState('');
  const wasOpen=useRef(false),afterClose=useRef(onClose);afterClose.current=onClose;
  const close=()=>setOpen(false);
  useEffect(()=>{if(!open&&wasOpen.current)afterClose.current();wasOpen.current=open;},[open]);
  const refresh=useRef(onRefresh);refresh.current=onRefresh;
  const currentSession=useRef(sessionId);currentSession.current=sessionId;
  useEffect(()=>{
    let alive=true;let previous:string|null=null;
    const load=async()=>{try{const result=await api.getGoal(sessionId);if(!alive)return;setGoal(result.goal);setLoaded(true);const key=result.goal?.currentRound?result.goal.currentRound.runId+':'+result.goal.currentRound.status:'';if(previous!==null&&key!==previous)refresh.current();previous=key;}catch(e){if(alive){setError(e instanceof Error?e.message:String(e));setLoaded(true);}}};
    setGoal(null);setLoaded(false);setOpen(false);setSaving(false);setEditing(false);setError('');void load();const timer=setInterval(()=>void load(),1000);
    return()=>{alive=false;clearInterval(timer);};
  },[sessionId]);
  const begin=()=>{setEditing(false);setObjective(goal?.objective || '');setPlan(goal?.steps.map(s=>s.text).join('\n') || '');setOpen(true);setError('');};
  useEffect(()=>{if(openRequest>0)begin();},[openRequest]);
  const mutate=async(action:()=>Promise<{goal:Goal}>)=>{
    const id=sessionId;setSaving(true);setError('');
    try{const result=await action();if(currentSession.current===id){setGoal(result.goal);setEditing(false);refresh.current();}}
    catch(e){if(currentSession.current===id)setError(e instanceof Error?e.message:String(e));}
    finally{if(currentSession.current===id)setSaving(false);}
  };
  const control=(action:'start'|'pause'|'cancel'|'confirm',autoContinue?:boolean)=>{if(goal)void mutate(()=>api.controlGoal(sessionId,action,goal.revision,autoContinue));};
  const ended=goal?.phase==='completed'||goal?.phase==='cancelled';
  const labels={active:t('Đang thực hiện','Working'),paused:t('Đã tạm dừng','Paused'),blocked:t('Cần xử lý trước khi tiếp tục','Needs attention'),review_required:t('Chờ bạn kiểm tra kết quả','Awaiting your review'),completed:t('Đã hoàn thành','Completed'),cancelled:t('Đã hủy','Cancelled')};
  const button='rounded-md px-3 py-2 text-sm border border-[var(--border-subtle)] hover:bg-[var(--surface-hover)] disabled:opacity-50';
  return <>
    {goal&&!ended&&<button type="button" onClick={begin} aria-label={t('Quản lý mục tiêu','Manage goal')} aria-expanded={open} className="mb-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">{t('Mục tiêu','Goal')} · {labels[goal.phase]}</button>}
    {open&&createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4" onClick={close}>
      <section role="dialog" aria-modal="true" aria-label={t('Mục tiêu và kế hoạch','Goal and plan')} className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-xl p-5 shadow-xl bg-[var(--surface-elevated)] text-[var(--text-primary)]" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const items=[...e.currentTarget.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')];const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
        <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">{t('Mục tiêu và kế hoạch','Goal and plan')}</h2><button autoFocus onClick={close} aria-label={t('Đóng mục tiêu','Close goal')}><X size={18}/></button></div>
        {!loaded?<p>{t('Đang tải…','Loading…')}</p>:<>
          {goal&&<div data-goal-phase={goal.phase} className="mb-4 text-sm"><p className="font-medium">{labels[goal.phase]}</p><p>{t('Lượt','Round')} {goal.roundsStarted}/{goal.limits.rounds} · {t('Yêu cầu AI','AI requests')} {goal.usage.used.requests}/{goal.limits.requests}</p>{goal.reason==='restart_requires_resume'&&<p>{t('Dịch vụ đã khởi động lại. Kiểm tra thao tác đang dở trước khi tiếp tục.','The service restarted. Check unfinished actions before continuing.')}</p>}{goal.reason==='unresolved_actions'&&<p>{t('Có thao tác chưa xác minh hoặc bị từ chối. Kiểm tra kết quả trước khi tiếp tục.','An action is unverified or denied. Check its result before continuing.')}</p>}{goal.reason==='limit_exhausted'&&<p>{t('Đã đạt giới hạn của mục tiêu này.','This goal reached its limit.')}</p>}</div>}
          {!goal||ended?<p className="text-sm mb-4">{t('Nhắn yêu cầu trong chat. AI sẽ tự xác định mục tiêu và lập kế hoạch khi công việc cần nhiều bước. Bạn có thể xem tiến độ, điều chỉnh hoặc tạm dừng tại đây.','Send your request in chat. AI will set a goal and plan when the work needs multiple steps. You can view progress, adjust or pause it here.')}</p>:editing?<form onSubmit={e=>{e.preventDefault();const body={objective,steps:plan.split('\n').filter(s=>s.trim()).map(text=>({text})),expectedRevision:goal?.revision || 0};void mutate(()=>api.editGoal(sessionId,body));}}>
            <label className="block text-sm">{t('Mục tiêu','Objective')}<textarea aria-label={t('Mục tiêu','Objective')} required maxLength={4000} value={objective} onChange={e=>setObjective(e.target.value)} className="block w-full my-2 p-2 rounded-md border bg-transparent"/></label>
            <label className="block text-sm">{t('Kế hoạch — mỗi dòng một bước','Plan — one step per line')}<textarea aria-label={t('Các bước kế hoạch','Plan steps')} value={plan} onChange={e=>setPlan(e.target.value)} className="block w-full my-2 p-2 rounded-md border bg-transparent"/></label>
            <button disabled={saving} className={button}>{t('Lưu thay đổi','Save changes')}</button>
          </form>:<>
            <p className="mb-3 whitespace-pre-wrap">{goal.objective}</p>
            {goal.steps.length>0&&<ol className="list-decimal pl-5 mb-4 text-sm">{goal.steps.map(s=><li key={s.id}>{s.text}{s.status==='done'?t(' · đã làm, chưa xác minh',' · reported done, unverified'):s.status==='in_progress'?t(' · đang làm',' · in progress'):''}</li>)}</ol>}
            <div className="flex flex-wrap gap-2">
              {goal.phase==='active'?<button disabled={saving} className={button} onClick={()=>control('pause')}>{t('Tạm dừng','Pause')}</button>:goal.phase==='review_required'?<button disabled={saving} className={button} onClick={()=>control('confirm')}>{t('Tôi đã kiểm tra, hoàn thành','I checked the result, complete')}</button>:<><button disabled={saving} className={button} onClick={()=>control('start',false)}>{t('Chạy một lượt','Run one round')}</button><button disabled={saving} className={button} onClick={()=>control('start',true)}>{t('Tiếp tục','Continue')}</button></>}
              {goal.phase!=='active'&&<button disabled={saving} className={button} onClick={()=>{setObjective(goal.objective);setPlan(goal.steps.map(s=>s.text).join('\n'));setEditing(true);}}>{t('Sửa kế hoạch','Edit plan')}</button>}
              <button disabled={saving} className={button} onClick={()=>control('cancel')}>{t('Hủy mục tiêu','Cancel goal')}</button>
            </div>
          </>}
          <p className="text-xs mt-4 text-[var(--text-secondary)]">{t('AI tự quản lý kế hoạch từ yêu cầu của bạn. Hệ thống dừng khi cần bạn xử lý hoặc đạt giới hạn.','AI manages the plan from your request. Execution stops when your input is needed or limits are reached.')}</p>
        </>}
        {error&&<p role="alert" className="text-sm mt-3 text-red-500">{error}</p>}
      </section>
    </div>,document.body)}
  </>;
}
