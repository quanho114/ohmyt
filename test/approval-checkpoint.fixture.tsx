import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PermissionModal} from '../src/components/PermissionModal.tsx';
import type {PermissionRequest} from '../src/types.ts';
import '../src/index.css';
const base:PermissionRequest={requestId:'one',runId:'run',scopeId:'chat',toolName:'browser_tabs',target:'tab:shared',description:'Xem các tab đang có để chọn nơi thực hiện yêu cầu.',input:{}};
const html = '<!DOCTYPE html><html lang="vi"><head><title>Bò nông dân</title></head><body><script>window.INJECTED=true</script>' + '<div>🌊 Bò nông dân chạy trên biển</div>\n'.repeat(1200) + '</body></html>';
function Fixture(){
 const [request,setRequest]=useState<PermissionRequest|null>(base),[decision,setDecision]=useState('');
 return <><button onClick={()=>setRequest({...base,requestId:crypto.randomUUID()})}>New request</button><button onClick={()=>setRequest({...base,requestId:crypto.randomUUID(),toolName:'shell_exec',target:'echo "<script>alert(1)</script>"',projectId:'project'})}>Command</button><button onClick={()=>setRequest({...base,requestId:crypto.randomUUID(),toolName:'html_preview',target:html,input:{name:'bo-nong-dan.html',content:html},description:`Create preview: ${html}`})}>HTML preview</button><button onClick={()=>setRequest({...base,requestId:crypto.randomUUID(),toolName:'connector_custom_tool',target:html,input:{content:html}})}>Unknown tool</button><output>{decision}</output><PermissionModal request={request} onRespond={value=>{setDecision(value);setRequest(null);}}/></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
