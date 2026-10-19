import {createRoot} from 'react-dom/client';
import {Composer} from '../src/components/Composer.tsx';
import '../src/index.css';
let goal={id:'command-ui',objective:'Original task',revision:1,phase:'active',steps:[],runtime:{activation:'disarmed',running:false}};
const calls:{url:string;body:Record<string,unknown>}[]=[],sent:string[]=[];
window.fetch=async(input,init)=>{
 const url=String(input),body=JSON.parse(String(init?.body || '{}'));
 if(init?.method){calls.push({url,body});if(body.input==='/goal pause')goal={...goal,phase:'paused',revision:goal.revision+1};}
 return new Response(JSON.stringify({goal}),{headers:{'Content-Type':'application/json'}});
};
(window as any).goalCommands={calls,sent};
createRoot(document.getElementById('root')!).render(<Composer sessionId="commands" providers={[]} selectedModel={null} onSelectModel={()=>{}} locale="en" onSend={text=>{sent.push(text);}}/>);
