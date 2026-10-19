import {canSail,landmarks,type Point} from './world.ts';
export type Creature='birds'|'shark'|'dinosaur'|'octopus';
export const creatures:Creature[]=['birds','shark','dinosaur','octopus'];
export interface LifePose extends Point{frame:number;flip:boolean;alpha:number;reacting:boolean;}
export function lifePose(kind:Creature,time:number,boat:Point,called=false):LifePose{
 const landmark=landmarks.find(l=>l.id===kind)!;
 const reacting=called||Math.hypot(boat.x-landmark.x,boat.y-landmark.y)<.16;
 const phase=time*(reacting?1.8:1);
 const frame=Math.floor(phase*(kind==='birds'?5:kind==='octopus'?2:1.1))%2;
 if(kind==='birds')return {x:.44+Math.sin(time*.34)*.15,y:.21+Math.cos(time*.34)*.075,frame:Math.floor(time*3.5)%2,flip:Math.cos(time*.34)<0,alpha:1,reacting};
 if(kind==='shark'){
  const center=reacting?boat:{x:.145,y:.665};
  const candidate={x:center.x+Math.cos(phase*.65)*.065,y:center.y+Math.sin(phase*.65)*.04};
  const p=canSail(candidate)?candidate:{x:.18+Math.cos(phase*.65)*.035,y:.64+Math.sin(phase*.65)*.025};
  return {...p,frame,flip:Math.sin(phase*.65)>0,alpha:1,reacting};
 }
 if(kind==='dinosaur')return {x:.875+Math.sin(time*.18)*.008,y:.205+Math.sin(time*.7)*.002,frame:reacting?1:frame,flip:false,alpha:1,reacting};
 return {x:.902+Math.sin(phase*.5)*.009,y:.727+Math.sin(phase*1.4)*.008,frame,flip:false,alpha:reacting?1:.45+.55*(.5+.5*Math.sin(time*.4)),reacting};
}
export function projectPoint(p:Point,w:number,h:number,_full:boolean):Point{
 return {x:p.x*w,y:p.y*h};
}

export type Foam={x:number;y:number;age:number;life:number;angle:number};
export class Wake{
 particles:Foam[]=[];private previous:Point|null=null;private carry=0;
 reset(){this.particles=[];this.previous=null;this.carry=0;}
 step(p:Point,dt:number,moving:boolean){
  const delta=Math.min(Math.max(dt,0),.05);
  for(const particle of this.particles)particle.age+=delta;
  this.particles=this.particles.filter(particle=>particle.age<particle.life);
  const previous=this.previous;this.previous={...p};
  if(!previous)return;
  const dx=p.x-previous.x,dy=p.y-previous.y,distance=Math.hypot(dx,dy);
  if(!moving||distance<.08||distance>80){this.carry=0;return;}
  const angle=Math.atan2(dy,dx);this.carry+=delta;
  if(this.carry>=.045){this.carry=0;this.particles.push({x:p.x-Math.cos(angle)*22,y:p.y+11-Math.sin(angle)*22,age:0,life:1.35,angle});}
  if(this.particles.length>40)this.particles.splice(0,this.particles.length-40);
 }
}

/** Continuous flight: changing interest never replaces the bird's position. */
export class BirdFlight{
 private point:Point={x:.44,y:.285};
 private velocity:Point={x:.035,y:0};
 private center:Point={x:.44,y:.21};
 private flip=false;
 step(dt:number,time:number,boat:Point,reacting:boolean,animate=true):LifePose{
  const delta=animate?Math.min(Math.max(dt,0),.05):0;
  const interest=reacting?{x:boat.x,y:Math.max(.12,boat.y-.055)}:{x:.44,y:.21};
  const shift=Math.hypot(interest.x-this.center.x,interest.y-this.center.y);
  const blend=shift?Math.min(1,.055*delta/shift):0;
  this.center.x+=(interest.x-this.center.x)*blend;this.center.y+=(interest.y-this.center.y)*blend;
  const target={x:this.center.x+Math.sin(time*.34)*.12,y:this.center.y+Math.cos(time*.34)*.06};
  const dx=target.x-this.point.x,dy=target.y-this.point.y,distance=Math.hypot(dx,dy);
  const speed=Math.min(.055,distance*.8);
  const desired={x:distance?dx/distance*speed:0,y:distance?dy/distance*speed:0};
  const acceleration=Math.hypot(desired.x-this.velocity.x,desired.y-this.velocity.y);
  const steering=acceleration?Math.min(1,.075*delta/acceleration):0;
  this.velocity.x+=(desired.x-this.velocity.x)*steering;this.velocity.y+=(desired.y-this.velocity.y)*steering;
  this.point.x=Math.max(.04,Math.min(.96,this.point.x+this.velocity.x*delta));
  this.point.y=Math.max(.06,Math.min(.9,this.point.y+this.velocity.y*delta));
  if(this.velocity.x<-.006)this.flip=true;else if(this.velocity.x>.006)this.flip=false;
  // Brief flapping bursts separated by glides; independent of proximity changes.
  const phase=time%3.6;
  const frame=animate&&phase<1.35?Math.floor(time*3.5)%2:1;
  return {...this.point,frame,flip:this.flip,alpha:1,reacting};
 }
}
