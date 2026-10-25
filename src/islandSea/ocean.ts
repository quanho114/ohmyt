/** Refraction and travelling wave crests, clipped to water in the original art. */
export class OceanSurface{
 private source=document.createElement('canvas');
 private mask=document.createElement('canvas');
 private layer=document.createElement('canvas');
 private surf=Array.from({length:4},()=>document.createElement('canvas'));
 ready=false;
 async prepare(image:HTMLImageElement){
  let deadline=performance.now()+4;
  const yieldToPage=async()=>{
   if(performance.now()<deadline)return;
   await new Promise<void>(resolve=>setTimeout(resolve,0));
   deadline=performance.now()+4;
  };
  const width=Math.min(960,image.naturalWidth),height=Math.round(width*image.naturalHeight/image.naturalWidth);
  for(const canvas of [this.source,this.mask,this.layer,...this.surf]){canvas.width=width;canvas.height=height;}
  const source=this.source.getContext('2d')!,mask=this.mask.getContext('2d')!;
  source.drawImage(image,0,0,width,height);
  const pixels=source.getImageData(0,0,width,height);
  const original=new Uint8ClampedArray(pixels.data);
  for(let i=0;i<pixels.data.length;i+=4){
   if(i%(width*4)===0)await yieldToPage();
   const r=original[i],g=original[i+1],b=original[i+2];
   // Sand, foliage, rocks and buildings stay fixed; submerged reef refracts.
   const water=Math.min((b-r*1.16)/24,(g-r*1.12)/20,(b-65)/35);
   pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;
   pixels.data[i+3]=Math.max(0,Math.min(1,water))*255;
  }
  mask.putImageData(pixels,0,0);
  // Reject isolated warm-colored fish and coral before finding the shore.
  const dryLand=new Uint8Array(width*height),queue=new Uint32Array(width*height);
  for(let p=0;p<dryLand.length;p++){
   if(p%width===0)await yieldToPage();
   const i=p*4;
   if(original[i]>70&&original[i+2]<original[i]*1.1&&original[i+1]<original[i]*1.3)dryLand[p]=1;
  }
  for(let p=0;p<dryLand.length;p++){
   if(p%width===0)await yieldToPage();
   if(dryLand[p]!==1)continue;
   let count=1;queue[0]=p;dryLand[p]=2;
   for(let head=0;head<count;head++){
    if(head%1024===0)await yieldToPage();
    const q=queue[head],x=q%width;
    for(const n of [x>0?q-1:-1,x<width-1?q+1:-1,q-width,q+width]){
     if(n<0||n>=dryLand.length||dryLand[n]!==1)continue;
     dryLand[n]=2;queue[count++]=n;
    }
   }
   for(let i=0;i<count;i++)dryLand[queue[i]]=count>=64?3:0;
  }
  const bands=this.surf.map(()=>mask.createImageData(width,height));
  const distances=[2,4,7,10],directions=[[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,.7],[.7,-.7],[-.7,-.7]];
  for(let y=10;y<height-10;y++){
   await yieldToPage();
   for(let x=10;x<width-10;x++){
    const i=(y*width+x)*4;if(pixels.data[i+3]<180)continue;
    for(let band=0;band<distances.length;band++){
     const dry=directions.some(([dx,dy])=>{
      const n=Math.round(y+dy*distances[band])*width+Math.round(x+dx*distances[band]);
      return dryLand[n]===3;
     });
     if(!dry)continue;
     bands[band].data[i]=bands[band].data[i+1]=bands[band].data[i+2]=255;
     bands[band].data[i+3]=pixels.data[i+3];break;
    }
   }
  }
  this.surf.forEach((canvas,i)=>canvas.getContext('2d')!.putImageData(bands[i],0,0));
  this.ready=true;
 }
 draw(ctx:CanvasRenderingContext2D,width:number,height:number,time:number){
  if(!this.ready)return;
  const w=this.layer.width,h=this.layer.height,c=this.layer.getContext('2d')!;
  c.clearRect(0,0,w,h);c.globalCompositeOperation='source-over';
  // Multiple swell periods bend the existing caustics rather than sliding the map.
  for(let y=0;y<h;y+=3){
   const shift=Math.sin(y*.041-time*1.35)*1.7+Math.sin(y*.093-time*.8)*.65;
   const rise=Math.sin(y*.027-time*1.1)*1.1;
   const sy=Math.max(0,Math.min(h-3,y+rise));
   c.drawImage(this.source,0,sy,w,Math.min(3,h-y),shift,y,w,Math.min(3,h-y));
  }
  c.lineCap='round';c.lineJoin='round';
  const first=Math.floor(-time*10/32)-7;
  for(let row=first;row<first+Math.ceil(h/32)+10;row++){
   const base=row*32+time*10+Math.sin(row*47)*7;
   // Broad shaded trough, lit face, then a broken narrow crest.
   for(let pass=0;pass<3;pass++){
    c.beginPath();
    for(let x=-16;x<=w+16;x+=12){
     const y=base+x*.13+Math.sin(x*.014+row*1.7-time*.5)*6+Math.sin(x*.036-row*.8+time*.3)*2;
     const offset=pass===0?5:pass===1?0:-1;
     if(x===-16)c.moveTo(x,y+offset);else c.lineTo(x,y+offset);
    }
    c.lineWidth=pass===0?7:pass===1?3:1;
    c.strokeStyle=pass===0?'rgba(0,65,100,.075)':pass===1?'rgba(163,245,244,.12)':'rgba(231,255,250,.19)';
    if(pass===2){c.setLineDash([9+4*Math.sin(row),33,17,56]);c.lineDashOffset=-time*7-row*19;}
    c.stroke();c.setLineDash([]);
   }
  }
  // Successive shore bands wash in towards dry sand/rock and dissolve again.
  this.surf.forEach((band,i)=>{
   c.globalAlpha=Math.pow(.5+.5*Math.cos(time*2.3+i*.85),4)*.32;
   c.drawImage(band,0,0);
  });
  c.globalAlpha=1;
  c.globalCompositeOperation='destination-in';c.drawImage(this.mask,0,0);
  c.globalCompositeOperation='source-over';
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.drawImage(this.layer,0,0,width,height);ctx.restore();
 }
}
