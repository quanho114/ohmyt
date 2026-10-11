import {useEffect,useRef,useState} from 'react';
import {Target,Pause,Play,Pencil,Trash2,Check,X} from 'lucide-react';
import {api,type Goal} from '../api.ts';

export function MiniGoal({sessionId,locale,onRefresh}:{sessionId:string;locale:'vi'|'en';onRefresh?:()=>void}){
  const [goal,setGoal]=useState<Goal|null>(null),[busy,setBusy]=useState(false),[editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[error,setError]=useState('');
  const [hidden,setHidden]=useState(()=>localStorage.getItem(`ohmyt_hidden_goal_${sessionId}`));
  const alive=useRef(true),en=locale==='en';
  const refresh=useRef(onRefresh);refresh.current=onRefresh;
  useEffect(()=>{alive.current=true;let active=true,previous:string|null=null;const load=async()=>{try{const result=await api.getGoal(sessionId);if(active){setGoal(result.goal);const round=result.goal?.currentRound,key=round?round.runId+':'+round.status:'';if(previous!==null&&key!==previous)refresh.current?.();previous=key;}}catch(e){if(active)setError(e instanceof Error?e.message:String(e));}};void load();const timer=setInterval(load,500);return()=>{active=false;alive.current=false;clearInterval(timer);};},[sessionId]);
  const act=async(action:'pause'|'start'|'cancel'|'confirm')=>{
    if(!goal||busy)return;setBusy(true);setError('');
    try{const result=await api.controlGoal(sessionId,action,goal.revision,action==='start'?true:undefined);if(alive.current){setGoal(result.goal);if(action==='cancel')setEditing(false);}return result.goal;}
    catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(alive.current)setBusy(false);}
  };
  const edit=async()=>{if(!goal)return;const next=goal.phase==='active'?await act('pause'):goal;if(next&&alive.current){setDraft(next.objective);setEditing(true);}};
  const save=async()=>{
    if(!goal||!draft.trim()||busy)return;setBusy(true);setError('');
    try{
      // Pause aborts immediately, but edits must wait for the turn to release ownership.
      for(let attempt=0;attempt<100;attempt++){
        const latest=(await api.getGoal(sessionId)).goal;if(!alive.current)return;if(!latest)throw new Error('Goal unavailable');
        try{const result=await api.editGoal(sessionId,{objective:draft,steps:latest.steps.map(s=>({...s})),expectedRevision:latest.revision});if(alive.current){setGoal(result.goal);setEditing(false);}break;}
        catch(e){if(attempt===99||!(e instanceof Error)||!/active round|revision conflict/i.test(e.message))throw e;await new Promise(resolve=>setTimeout(resolve,100));if(!alive.current)return;}
      }
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}finally{if(alive.current)setBusy(false);}
  };
  if(!goal)return error?<p role="alert" className="mb-2 text-xs text-red-500">{en?'Could not load goal: ':'Không tải được Goal: '}{error}</p>:null;
  if(goal.phase==='cancelled'||goal.phase==='completed'||goal.id===hidden)return null;
  const label=en?{active:'Working',paused:'Paused',blocked:'Needs attention',review_required:'Ready for review',completed:'Completed',cancelled:''}[goal.phase]:{active:'Đang làm',paused:'Tạm dừng',blocked:'Cần xử lý',review_required:'Chờ kiểm tra',completed:'Hoàn thành',cancelled:''}[goal.phase];
  const ended=goal.phase==='completed';
  const button='inline-flex shrink-0 items-center justify-center rounded p-1 hover:bg-[var(--surface-hover)] disabled:opacity-40';
  return <div className="mb-2 text-xs" data-mini-goal={goal.phase}>
    <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-[var(--surface-secondary)]">
      <Target size={13} style={{color:'#2563eb'}}/><span className="font-semibold" style={{color:'#2563eb'}}>Goal</span>
      <span className="truncate min-w-0 flex-1" title={goal.objective}>{goal.objective}</span><span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{label}</span>
      {!ended&&<>
        {goal.phase==='review_required'&&<button className={button} disabled={busy} title={en?'I checked the result, complete':'Tôi đã kiểm tra, hoàn thành'} aria-label={en?'I checked the result, complete':'Tôi đã kiểm tra, hoàn thành'} onClick={()=>void act('confirm')}><Check size={13}/></button>}
        <button className={button} disabled={busy||goal.phase==='review_required'} title={goal.phase==='active'?(en?'Pause goal':'Tạm dừng Goal'):(en?'Resume goal':'Tiếp tục Goal')} aria-label={goal.phase==='active'?(en?'Pause goal':'Tạm dừng Goal'):(en?'Resume goal':'Tiếp tục Goal')} onClick={()=>void act(goal.phase==='active'?'pause':'start')}>{goal.phase==='active'?<Pause size={13}/>:<Play size={13}/>}</button>
        <button className={button} disabled={busy} title={en?'Edit goal':'Sửa Goal'} aria-label={en?'Edit goal':'Sửa Goal'} onClick={()=>void edit()}><Pencil size={13}/></button>
      </>}
      {<button className={button} disabled={busy} title={en?'Delete goal':'Xóa Goal'} aria-label={en?'Delete goal':'Xóa Goal'} onClick={()=>{if(ended){localStorage.setItem(`ohmyt_hidden_goal_${sessionId}`,goal.id);setHidden(goal.id);}else void act('cancel');}}><Trash2 size={13}/></button>}
    </div>
    {editing&&<form className="flex gap-1 mt-1" onSubmit={e=>{e.preventDefault();void save();}}><input autoFocus aria-label={en?'Goal objective':'Nội dung Goal'} value={draft} maxLength={4000} onChange={e=>setDraft(e.target.value)} className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1"/><button type="submit" className={button} disabled={busy||!draft.trim()} aria-label={en?'Save goal':'Lưu Goal'}><Check size={13}/></button><button type="button" className={button} onClick={()=>setEditing(false)} aria-label={en?'Cancel edit':'Hủy sửa'}><X size={13}/></button></form>}
    {error&&<p role="alert" className="text-red-500 mt-1">{error}</p>}
  </div>;
}
