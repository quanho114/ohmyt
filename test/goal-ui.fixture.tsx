import React from 'react';
import {createRoot} from 'react-dom/client';
import {MiniGoal} from '../src/components/MiniGoal.tsx';
import {applyAppearance,defaultAppearance} from '../src/appearance.ts';
import type {Goal} from '../src/api.ts';
import '../src/index.css';

let goal:Goal={version:1,id:'goal-ui',sessionId:'goal-test',revision:1,objective:'Build an assistant workspace with durable goals and inspectable results',
  steps:Array.from({length:36},(_,i)=>({id:`step-${i}`,text:i===0?'Inspect current project architecture and preserve existing edits':`Task ${i}: implement and validate a long objective without overflowing the available layout`,status:i<2?'done':i===2?'in_progress':'pending'})),
  limits:{rounds:3,requests:20,tools:30},phase:'active',autoContinue:true,roundsStarted:1,reason:null,currentRound:null,evidenceRefs:[],usage:{used:{requests:0,tools:0}},runtime:{activation:'armed',running:true}};
const calls:{url:string;body:Record<string,unknown>}[]=[];
let failNext=false;
window.fetch=async(input,init)=>{
  const url=String(input),body=JSON.parse(String(init?.body||'{}'));
  if(init?.method){
    calls.push({url,body});
    if(failNext){failNext=false;return new Response(JSON.stringify({error:'Fixture revision conflict'}),{status:409});}
    if(body.action==='pause')goal={...goal,phase:'paused',runtime:{activation:'disarmed',running:false},revision:goal.revision+1};
    if(body.action==='start')goal={...goal,phase:'active',runtime:{activation:'armed',running:true},revision:goal.revision+1};
    if(body.action==='confirm')goal={...goal,phase:'completed',revision:goal.revision+1};
    if(body.action==='cancel')goal={...goal,phase:'cancelled',revision:goal.revision+1};
    if(typeof body.objective==='string')goal={...goal,objective:body.objective,revision:goal.revision+1};
  }
  return new Response(JSON.stringify({goal}),{headers:{'Content-Type':'application/json'}});
};
(window as any).goalFixture={calls,set:(patch:Partial<Goal>)=>{goal={...goal,...patch,revision:goal.revision+1};},fail:()=>{failNext=true;},theme:(dark:boolean)=>applyAppearance({...defaultAppearance,themeMode:dark?'dark':'light'},document.documentElement,dark)};
applyAppearance({...defaultAppearance,themeMode:'light'},document.documentElement,false);
createRoot(document.getElementById('root')!).render(<main style={{maxWidth:800,margin:'48px auto',padding:'16px'}}><MiniGoal sessionId="goal-test" locale="en"/><div className="composer-shell" style={{minHeight:110,padding:16,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16}}><textarea aria-label="Chat draft" placeholder="Send a message…" style={{width:'100%',background:'transparent',color:'var(--text-primary)'}}/></div></main>);
