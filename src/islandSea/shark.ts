import type {SharkPose} from './life.ts';

/** Top-down submerged body; only the dorsal fin cuts through the surface. */
export function drawShark(ctx:CanvasRenderingContext2D,pose:SharkPose,x:number,y:number,size:number,width:number,height:number,time:number){
 const heading=Math.atan2(Math.sin(pose.heading)*height,Math.cos(pose.heading)*width);
 ctx.save();ctx.translate(x,y);ctx.save();ctx.rotate(heading);ctx.scale(size/80,size/80);
 ctx.lineJoin='round';ctx.lineCap='round';
 const tail=pose.tail*22,submerge=.26+pose.depth*.18;
 ctx.filter='blur(.55px)';
 // The blue-green silhouette sits beneath the water instead of casting a sticker shadow.
 ctx.fillStyle=`rgba(11,69,85,${submerge})`;
 ctx.beginPath();ctx.moveTo(32,0);ctx.bezierCurveTo(19,-9,-3,-9,-23,tail*.55-3);
 ctx.lineTo(-34,tail-1);ctx.lineTo(-44,tail-12);ctx.quadraticCurveTo(-42,tail,-38,tail+1);
 ctx.lineTo(-44,tail+11);ctx.lineTo(-33,tail+3);ctx.lineTo(-22,tail*.55+3);
 ctx.bezierCurveTo(-7,7,20,9,32,0);ctx.fill();
 // Swept pectoral fins, attached well behind the rounded snout.
 ctx.beginPath();ctx.moveTo(10,-4);ctx.lineTo(-9,-19);ctx.quadraticCurveTo(-11,-12,-5,-5);ctx.closePath();ctx.fill();
 ctx.beginPath();ctx.moveTo(10,4);ctx.lineTo(-9,18);ctx.quadraticCurveTo(-11,11,-5,5);ctx.closePath();ctx.fill();
 const back=ctx.createLinearGradient(0,-6,0,6);back.addColorStop(0,`rgba(91,155,164,${submerge+.12})`);back.addColorStop(1,`rgba(18,85,105,${submerge})`);
 ctx.fillStyle=back;ctx.beginPath();ctx.ellipse(6,0,24,5,0,0,Math.PI*2);ctx.fill();
 ctx.filter='none';
 ctx.strokeStyle='rgba(114,219,220,.24)';ctx.lineWidth=1;
 ctx.beginPath();ctx.moveTo(-14,-1);ctx.quadraticCurveTo(6,-4,22,-1);ctx.stroke();
 // Low bow wave and a tapering V trail follow the actual heading.
 for(let i=0;i<3;i++){
  const drift=(time*.55+i/3)%1;
  ctx.strokeStyle=`rgba(206,248,243,${(1-drift)*.32})`;ctx.lineWidth=.8;
  ctx.beginPath();ctx.moveTo(-9-drift*33,-7-drift*10);ctx.quadraticCurveTo(9-drift*12,-2,12-drift*10,0);
  ctx.quadraticCurveTo(9-drift*12,2,-9-drift*33,7+drift*10);ctx.stroke();
 }
 ctx.restore();ctx.scale(size/80,size/80);
 const dx=Math.cos(heading),dy=Math.sin(heading)*.4;
 // The fin rises vertically out of the water even as the submerged body turns.
 const fin=ctx.createLinearGradient(-7,-8,7,3);fin.addColorStop(0,'#8daeb4');fin.addColorStop(.35,'#426671');fin.addColorStop(1,'#244c5b');
 ctx.fillStyle=fin;ctx.beginPath();ctx.moveTo(dx*9,dy*9+1);ctx.quadraticCurveTo(dx,-4,-dx*3-.7,-dy*3-13);
 ctx.quadraticCurveTo(-dx*9-1,-dy*9-9,-dx*9,-dy*9+2);ctx.quadraticCurveTo(0,3,dx*9,dy*9+1);ctx.fill();
 ctx.strokeStyle='rgba(212,243,239,.7)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(-dx*9,-dy*9+2);ctx.quadraticCurveTo(0,3,dx*9,dy*9+1);ctx.stroke();
 ctx.restore();
}
