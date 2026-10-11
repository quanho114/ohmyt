import {Clock3,Send,Trash2} from 'lucide-react';
import type {InboxMessage} from '../api.ts';
export function PendingMessages({messages,busy,onMode,onCancel,en}:{messages:InboxMessage[];busy:boolean;onMode:(id:string,kind:'queued'|'steering')=>Promise<unknown>;onCancel:(id:string)=>Promise<unknown>;en:boolean}){
  if(!messages.length)return null;
  return <section className="harness-pending" aria-label={en?'Pending tasks':'Tác vụ chờ'}>
    <div className="harness-pending-heading">{en?'Pending tasks':'Tác vụ chờ'} <span>{messages.length}</span></div>
    {messages.map(item=><div key={item.id} className="harness-pending-row">
      <span title={item.content}>{item.content}</span>
      <div className="harness-pending-actions">
        <button type="button" disabled={busy} aria-pressed={item.kind==='queued'} aria-label={en?'Wait until task finishes':'Chờ tác vụ hoàn tất'} title={en?'Wait until task finishes':'Chờ tác vụ hoàn tất'} onClick={()=>void onMode(item.id,'queued').catch(()=>{})}><Clock3 size={15}/></button>
        <button type="button" disabled={busy} aria-pressed={item.kind==='steering'} aria-label={en?'Send now':'Gửi ngay'} title={en?'Send now':'Gửi ngay'} onClick={()=>void onMode(item.id,'steering').catch(()=>{})}><Send size={15}/></button>
        <button type="button" disabled={busy} aria-label={en?'Delete pending task':'Xóa tác vụ chờ'} title={en?'Delete pending task':'Xóa tác vụ chờ'} onClick={()=>void onCancel(item.id).catch(()=>{})}><Trash2 size={15}/></button>
      </div>
    </div>)}
  </section>;
}
