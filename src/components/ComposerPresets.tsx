import {useEffect,useState} from 'react';
import {api,type AgentPreset} from '../api.ts';
export function ComposerPresets({en,disabled,sessionId}:{en:boolean;disabled:boolean;sessionId?:string|null}){
 const [presets,setPresets]=useState<AgentPreset[]>([]),[selected,setSelected]=useState('default'),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>{let disposed=false;void api.getPresets(sessionId).then(value=>{if(!disposed){setPresets(value.presets);setSelected(value.selectedId);}}).catch(()=>{});return()=>{disposed=true;};},[sessionId]);
 if(presets.length<2)return null;
 return <div className="composer-preset"><label className="composer-config-row"><span className="composer-config-label">{en?'Preset':'Cấu hình agent'}</span><select disabled={disabled||saving} value={selected} onChange={e=>{const id=e.target.value;setSaving(true);setError('');void api.selectPreset(id,sessionId).then(()=>setSelected(id)).catch(e=>setError(e.message)).finally(()=>setSaving(false));}}>{presets.map(p=><option key={p.id} value={p.id}>{p.id==='default'?(en?'Application default':'Mặc định của ứng dụng'):p.name || p.id}</option>)}</select></label>{error&&<p role="alert">{error}</p>}</div>;
}
