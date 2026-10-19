import React from 'react';
import {createRoot} from 'react-dom/client';
import {ContextMeter} from '../src/components/ContextMeter.tsx';
import '../src/index.css';
function Fixture(){const [mode,setMode]=React.useState('data');return <div style={{position:'fixed',bottom:24,right:24}}><button onClick={()=>setMode(mode==='data'?'other':'data')}>Switch model</button><ContextMeter selectedModel={{providerId:'p',modelId:mode}} usage={{used:6000,limit:24000,reserved:4000,accuracy:'estimated',providerId:'p',modelId:'data'}}/></div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
