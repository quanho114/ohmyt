import {OceanSurface} from './ocean.ts';

type SeaImages={atlas:HTMLImageElement;scenery:HTMLImageElement;boat:HTMLImageElement};
let images:SeaImages|null=null,imageRequest:Promise<SeaImages>|null=null;
let ocean:OceanSurface|null=null,oceanRequest:Promise<OceanSurface>|null=null;
let sceneTime=0;
export const getSeaTime=()=>sceneTime;
export const rememberSeaTime=(time:number)=>{sceneTime=time;};
export const peekSeaImages=()=>images;
export const peekOceanSurface=()=>ocean;

async function decode(name:string){
 const image=new Image();image.src=`/island-sea/${name}.png`;
 await image.decode();return image;
}
export function loadSeaImages():Promise<SeaImages>{
 if(images)return Promise.resolve(images);
 if(!imageRequest)imageRequest=Promise.all([decode('creatures'),decode('scenery'),decode('boat')])
  .then(([atlas,scenery,boat])=>images={atlas,scenery,boat})
  .catch(error=>{imageRequest=null;throw error;});
 return imageRequest;
}
/** One prepared texture and scratch buffer per page; drawing itself is synchronous. */
export function loadOceanSurface():Promise<OceanSurface>{
 if(ocean)return Promise.resolve(ocean);
 if(!oceanRequest)oceanRequest=loadSeaImages().then(async({scenery})=>{
  const surface=new OceanSurface();await surface.prepare(scenery);return ocean=surface;
 }).catch(error=>{oceanRequest=null;throw error;});
 return oceanRequest;
}
export async function warmSeaAssets(animated:boolean){
 await loadSeaImages();if(animated)await loadOceanSurface();
}
