import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ResponseActivity} from '../src/components/ResponseActivity';
import {PermissionModal} from '../src/components/PermissionModal';
import '../src/index.css';

const input={path:'module.js',expectedHash:'a'.repeat(64),oldText:'return 1;',newText:'return "<script>window.INJECTED=true</script>";'};
function Fixture(){
 const [state,setState]=useState('preview'),[approval,setApproval]=useState(true),[answer,setAnswer]=useState('');
 const applied=state==='applied',conflict=state==='conflict';
 const output=conflict?{success:false,applied:false,code:'FILE_CHANGED',error:'File changed since fs_read. Read the current version.'}:{success:true,applied,diff:'--- a/module.js\n+++ b/module.js\n@@ -1,1 +1,1 @@\n-return 1;\n+return "<script>window.INJECTED=true</script>";',diffTruncated:state==='truncated'};
 return <><div>{['preview','applied','conflict','truncated'].map(s=><button key={s} onClick={()=>setState(s)}>{s}</button>)}</div><output>{answer}</output>
  <ResponseActivity tools={[{id:'edit',name:'fs_edit',input,output,status:conflict?'error':'completed'}]} hasContent locale="vi" autoExpandTools={false} animated={false} isStreaming={false} status="completed"/>
  <PermissionModal request={approval?{requestId:'edit-review',runId:'run',toolName:'fs_edit',target:input.path,input,description:'Update return value',projectId:'p'}:null} onRespond={value=>{setAnswer(value);setApproval(false);}}/>
 </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
