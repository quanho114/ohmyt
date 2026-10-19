import {useEffect,useRef} from 'react';
import type {MutableRefObject} from 'react';
import type {Point} from './world.ts';
import {creatures,lifePose,projectPoint,Wake,BirdFlight,type Creature} from './life.ts';

interface Props{
 full:boolean;running:boolean;decorative:boolean;boat:MutableRefObject<Point>;
 reaction:{kind:Creature;revision:number}|null;
 onInteract:(kind:Creature)=>void;
 onError:()=>void;
}
export function SeaLife({full,running,decorative,boat,reaction,onInteract,onError}:Props){
 const canvas=useRef<HTMLCanvasElement>(null),clock=useRef(0),bird=useRef(new BirdFlight()),wake=useRef(new Wake()),call=useRef<{kind:Creature;until:number}|null>(null);
 const hitAreas=useRef<{kind:Creature;x:number;y:number;radius:number}[]>([]);
 useEffect(()=>{if(reaction)call.current={kind:reaction.kind,until:clock.current+4};},[reaction]);
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const ctx=el.getContext('2d');if(!ctx)return;
  const atlas=new Image();let loaded=false,disposed=false,raf=0,last=0,w=0,h=0;
  const draw=(dt:number)=>{
   if(disposed)return;
   if(running)clock.current+=Math.min(dt,.05);
   const time=clock.current,surfaceTime=decorative?time:0;
   ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=false;
   const ship=projectPoint(boat.current,w,h,full);
   wake.current.step(ship,running?dt:0,running);
   // Small surface ripples; slower, broader than the foam left by the hull.
   if(decorative){for(let i=0;i<9;i++){
    const x=((i*137+61)%997)/997*w,y=((i*73+19)%251)/251*h;
    ctx.strokeStyle=`rgba(238,255,255,${.10+.07*Math.sin(time*1.2+i)})`;ctx.lineWidth=1;
    ctx.beginPath();ctx.ellipse(x,y,10+Math.sin(time+i)*3,2,0,0,Math.PI);ctx.stroke();
   }}
   for(const p of wake.current.particles){
    const f=p.age/p.life;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.strokeStyle=`rgba(245,255,255,${(1-f)*.65})`;ctx.lineWidth=1.8*(1-f)+.4;
    ctx.beginPath();ctx.moveTo(-9-f*12,-5-f*12);ctx.quadraticCurveTo(7,0,-9-f*12,5+f*12);ctx.stroke();ctx.restore();
   }
   // A quiet bow ripple remains visible when anchored; travelling foam is separate.
   ctx.strokeStyle='rgba(235,255,255,.55)';ctx.lineWidth=1;
   ctx.beginPath();ctx.ellipse(ship.x,ship.y+12,25+Math.sin(surfaceTime*2)*2,6+Math.sin(surfaceTime*2),-.08,0,Math.PI*2);ctx.stroke();
   hitAreas.current=[];
   if(loaded)for(const kind of creatures){
    const called=call.current?.kind===kind&&time<call.current.until;
    const sample=lifePose(kind,decorative?time:0,boat.current,called);
    const pose=kind==='birds'?bird.current.step(running?dt:0,time,boat.current,sample.reacting,decorative):sample;
    const point=projectPoint(pose,w,h,full);
    const sizes={birds:full?47:36,shark:full?65:49,dinosaur:full?100:75,octopus:full?88:66};
    const size=sizes[kind];
    const column=kind==='birds'?pose.frame:kind==='shark'?2+pose.frame:kind==='dinosaur'?pose.frame:2+pose.frame;
    const row=kind==='birds'||kind==='shark'?0:1;
    const sw=atlas.naturalWidth/4,sh=atlas.naturalHeight/2;
    ctx.save();ctx.translate(point.x,point.y);if(pose.flip)ctx.scale(-1,1);ctx.globalAlpha=pose.alpha;
    ctx.drawImage(atlas,column*sw,row*sh,sw,sh,-size/2,-size/2,size,size);ctx.restore();
    if(kind==='shark'||kind==='octopus'){
     ctx.strokeStyle=`rgba(224,254,255,${pose.alpha*.45})`;ctx.beginPath();ctx.ellipse(point.x,point.y+size*.27,size*.43+Math.sin(surfaceTime*2)*3,6,0,0,Math.PI*2);ctx.stroke();
    }
    if(pose.reacting){ctx.font='15px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff7ca';ctx.shadowColor='#204a50';ctx.shadowBlur=4;ctx.fillText(kind==='shark'?'…':kind==='birds'?'♪':'♡',point.x,point.y-size*.45);ctx.shadowBlur=0;}
    hitAreas.current.push({kind,x:point.x,y:point.y,radius:size*.5});
   }
   el.dataset.reacting=creatures.filter(kind=>lifePose(kind,decorative?time:0,boat.current,call.current?.kind===kind&&time<call.current.until).reacting).join(' ');
   el.dataset.foam=String(wake.current.particles.length);
  };
  const resize=()=>{const bounds=el.getBoundingClientRect();w=bounds.width;h=bounds.height;const dpr=Math.min(window.devicePixelRatio||1,2);el.width=Math.round(w*dpr);el.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);wake.current.reset();draw(0);};
  const observer=new ResizeObserver(resize);observer.observe(el);
  atlas.onload=()=>{if(disposed)return;loaded=true;el.dataset.loaded='true';draw(0);};atlas.onerror=()=>{if(!disposed)onError();};atlas.src='/island-sea/creatures.png';
  const frame=(now:number)=>{if(disposed)return;raf=requestAnimationFrame(frame);if(now-last<33)return;const dt=last?(now-last)/1000:0;last=now;draw(dt);};
  resize();if(running)raf=requestAnimationFrame(frame);
  return()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();atlas.onload=null;atlas.onerror=null;};
 },[full,running,decorative,boat,reaction]);
 return <canvas ref={canvas} className="island-life" aria-hidden="true" onPointerDown={event=>{
  if(!full||!running)return;
  const bounds=event.currentTarget.getBoundingClientRect(),x=event.clientX-bounds.left,y=event.clientY-bounds.top;
  const hit=hitAreas.current.find(area=>Math.hypot(area.x-x,area.y-y)<area.radius);
  if(hit)onInteract(hit.kind);
  event.currentTarget.closest<HTMLElement>('.island-game')?.focus();
 }}/>;
}
