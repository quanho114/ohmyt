import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LiveHtmlPreview} from '../src/components/LiveHtmlPreview.tsx';
import {HtmlPreview} from '../src/components/HtmlPreview.tsx';
import '../src/index.css';
function Fixture(){
 const [content,setContent]=useState('<h1>'),[done,setDone]=useState(false);
 return <main style={{maxWidth:760,margin:'20px auto'}}>
  <button onClick={()=>setContent('<style>\nh1 { color: coral; }\n</style>\n<h1>Xin chào</h1>')}>Append</button>
  <button onClick={()=>setDone(true)}>Complete</button>
  <LiveHtmlPreview draft={{toolId:'html',name:'demo.html',content}} tools={done?[{id:'html',name:'html_preview',input:{name:'demo.html',content:'<style>\nh1 { color: coral; }\n</style>\n<h1>Xin chào</h1>'},status:'completed'}]:[]}/>
  {done&&<HtmlPreview artifact={{name:'demo.html',content:'<style>\nh1 { color: coral; }\n</style>\n<h1>Xin chào</h1>'}}/>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
