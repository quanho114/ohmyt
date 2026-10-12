import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ContentBlock} from '../src/components/ContentBlock.tsx';
import {defaultAppearance} from '../src/appearance.ts';
import '../src/index.css';
function Fixture() {
  const [lines,setLines]=useState(80);
  const [live,setLive]=useState(true);
  const [follow,setFollow]=useState(true);
  Object.assign(window,{codeFixture:{set:(n:number)=>flushSync(()=>setLines(n)),live:(v:boolean)=>flushSync(()=>setLive(v)),follow:(v:boolean)=>flushSync(()=>setFollow(v))}});
  return <ContentBlock language="python" code={Array.from({length:lines},(_,i)=>`print(${i})`).join('\n')} appearance={{...defaultAppearance,autoScroll:follow}} activeTheme="light" isStreaming={live}/>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
