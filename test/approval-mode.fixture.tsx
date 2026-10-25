import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Composer} from '../src/components/Composer.tsx';
import type {ApprovalMode} from '../src/types.ts';
import '../src/index.css';

window.fetch = async () => new Response(JSON.stringify({goal:null}), {headers:{'Content-Type':'application/json'}});
function Fixture() {
  const [mode,setMode]=useState<ApprovalMode>('ask');
  const [streaming,setStreaming]=useState(true);
  const [saving,setSaving]=useState(false);
  return <div style={{height:'100vh',display:'flex',flexDirection:'column',justifyContent:'flex-end',maxWidth:900,margin:'auto'}}>
    <button onClick={()=>setStreaming(value=>!value)}>Toggle run</button>
    <Composer sessionId="approval-fixture" approvalMode={mode} onChangeApprovalMode={async value=>{
      setSaving(true);
      try { await new Promise(resolve=>setTimeout(resolve,100)); setMode(value); }
      finally { setSaving(false); }
    }} disabled={saving} isStreaming={streaming} agentStatus={streaming?'running':'idle'}
      providers={[]} selectedModel={null} onSelectModel={()=>{}} onSend={()=>{}} onAbort={()=>{}}/>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
