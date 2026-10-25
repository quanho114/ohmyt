import {useEffect,useLayoutEffect,useRef} from 'react';
import type {MutableRefObject} from 'react';
import type {Point} from './world.ts';
import {creatures,lifePose,projectPoint,Wake,BirdFlight,SharkSwim,type Creature} from './life.ts';
import {getSeaTime,rememberSeaTime,peekSeaImages,peekOceanSurface,loadSeaImages,loadOceanSurface} from './assets.ts';
import {drawShark} from './shark.ts';

interface Props{
 full:boolean;running:boolean;decorative:boolean;boat:MutableRefObject<Point>;
 reaction:{kind:Creature;revision:number}|null;
 onInteract:(kind:Creature)=>void;
 onError:()=>void;
}
export function SeaLife({full,running,decorative,boat,reaction,onInteract,onError}:Props){
 const canvas=useRef<HTMLCanvasElement>(null),clock=useRef(getSeaTime()),bird=useRef(new BirdFlight()),shark=useRef(new SharkSwim()),wake=useRef(new Wake()),call=useRef<{kind:Creature;until:number}|null>(null);
 const active=useRef(running),paint=useRef<(dt:number)=>void>(()=>{});
 active.current=running;
 const hitAreas=useRef<{kind:Creature;x:number;y:number;radius:number}[]>([]);
 useEffect(()=>{if(reaction)call.current={kind:reaction.kind,until:clock.current+4};},[reaction]);
 useLayoutEffect(()=>{
  const el=canvas.current;if(!el)return;
  const ctx=el.getContext('2d');if(!ctx)return;
  let atlas=peekSeaImages()?.atlas,ocean=decorative?peekOceanSurface():null;
  let disposed=false,w=0,h=0;
  el.dataset.loaded=String(Boolean(atlas));el.dataset.waterLoaded=String(Boolean(ocean));
  const draw=(dt:number)=>{
   if(disposed)return;
   if(active.current){clock.current+=Math.min(dt,.05);rememberSeaTime(clock.current);}
   const time=clock.current,surfaceTime=decorative?time:0;
   ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=false;
   if(decorative)ocean?.draw(ctx,w,h,surfaceTime);
   const ship=projectPoint(boat.current,w,h,full);
   wake.current.step(ship,active.current?dt:0,active.current);
   for(const p of wake.current.particles){
    const f=p.age/p.life;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.strokeStyle=`rgba(245,255,255,${(1-f)*.65})`;ctx.lineWidth=1.8*(1-f)+.4;
    ctx.beginPath();ctx.moveTo(-9-f*12,-5-f*12);ctx.quadraticCurveTo(7,0,-9-f*12,5+f*12);ctx.stroke();ctx.restore();
   }
   // A quiet bow ripple remains visible when anchored; travelling foam is separate.
   ctx.strokeStyle='rgba(235,255,255,.55)';ctx.lineWidth=1;
   ctx.beginPath();ctx.ellipse(ship.x,ship.y+12,25+Math.sin(surfaceTime*2)*2,6+Math.sin(surfaceTime*2),-.08,0,Math.PI*2);ctx.stroke();
   hitAreas.current=[];
   if(atlas)for(const kind of creatures){
    const called=call.current?.kind===kind&&time<call.current.until;
    const sample=lifePose(kind,decorative?time:0,boat.current,called);
    const swimming=kind==='shark'?shark.current.step(active.current?dt:0,surfaceTime,boat.current,sample.reacting,decorative):null;
    const pose=swimming||(kind==='birds'?bird.current.step(active.current?dt:0,time,boat.current,sample.reacting,decorative):sample);
    const point=projectPoint(pose,w,h,full);
    const sizes={birds:full?47:36,shark:full?65:49,dinosaur:full?100:75,octopus:full?88:66};
    const size=sizes[kind];
    const column=kind==='birds'||kind==='dinosaur'?pose.frame:2+pose.frame;
    const row=kind==='birds'||kind==='shark'?0:1;
    const sw=atlas.naturalWidth/4,sh=atlas.naturalHeight/2;
    if(swimming)drawShark(ctx,swimming,point.x,point.y,size,w,h,surfaceTime);
    else{
     ctx.save();ctx.translate(point.x,point.y);if(pose.flip)ctx.scale(-1,1);ctx.globalAlpha=pose.alpha;
     ctx.drawImage(atlas,column*sw,row*sh,sw,sh,-size/2,-size/2,size,size);ctx.restore();
    }
    if(kind==='octopus'){
     ctx.strokeStyle=`rgba(224,254,255,${pose.alpha*.45})`;ctx.beginPath();ctx.ellipse(point.x,point.y+size*.27,size*.43+Math.sin(surfaceTime*2)*3,6,0,0,Math.PI*2);ctx.stroke();
    }
    if(pose.reacting){ctx.font='15px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff7ca';ctx.shadowColor='#204a50';ctx.shadowBlur=4;ctx.fillText(kind==='shark'?'…':kind==='birds'?'♪':'♡',point.x,point.y-size*.45);ctx.shadowBlur=0;}
    hitAreas.current.push({kind,x:point.x,y:point.y,radius:size*.5});
   }
   el.dataset.reacting=creatures.filter(kind=>lifePose(kind,decorative?time:0,boat.current,call.current?.kind===kind&&time<call.current.until).reacting).join(' ');
   el.dataset.foam=String(wake.current.particles.length);
   el.dataset.time=time.toFixed(3);
  };
  paint.current=draw;
  const resize=()=>{const bounds=el.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);if(w===bounds.width&&h===bounds.height&&el.width===Math.round(w*dpr)&&el.height===Math.round(h*dpr))return;w=bounds.width;h=bounds.height;el.width=Math.round(w*dpr);el.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);wake.current.reset();draw(0);};
  const observer=new ResizeObserver(resize);observer.observe(el);
  if(!atlas)void loadSeaImages().then(images=>{if(disposed)return;atlas=images.atlas;el.dataset.loaded='true';draw(0);}).catch(()=>{if(!disposed)onError();});
  if(decorative&&!ocean)void loadOceanSurface().then(surface=>{if(disposed)return;ocean=surface;el.dataset.waterLoaded='true';draw(0);}).catch(()=>{if(!disposed)onError();});
  resize();
  return()=>{disposed=true;paint.current=()=>{};observer.disconnect();};
 },[full,decorative,boat]);
 useEffect(()=>{
  let raf=0,last=0;
  const frame=(now:number)=>{raf=requestAnimationFrame(frame);if(now-last<33)return;const dt=last?(now-last)/1000:0;last=now;paint.current(dt);};
  if(running)raf=requestAnimationFrame(frame);
  return()=>cancelAnimationFrame(raf);
 },[running]);
 return <canvas ref={canvas} className="island-life" aria-hidden="true" onPointerDown={event=>{
  if(!full||!running)return;
  const bounds=event.currentTarget.getBoundingClientRect(),x=event.clientX-bounds.left,y=event.clientY-bounds.top;
  const hit=hitAreas.current.find(area=>Math.hypot(area.x-x,area.y-y)<area.radius);
  if(hit)onInteract(hit.kind);
  event.currentTarget.closest<HTMLElement>('.island-game')?.focus();
 }}/>;
}
