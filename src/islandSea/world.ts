export type Point={x:number;y:number};
export const landmarks=[
 {id:'harbor',x:.28,y:.28,name:'Bến Gió',icon:'⚓',description:'Bến gỗ nhỏ, nơi những chuyến hải trình bắt đầu.'},
 {id:'birds',x:.48,y:.37,name:'Mũi Cánh Trắng',icon:'🕊',description:'Chim biển làm tổ giữa những ngọn đá phủ rêu.'},
 {id:'dinosaur',x:.70,y:.37,name:'Đảo Rêu Cổ',icon:'🦕',description:'Một người bạn cổ dài đang tìm lá non bên thác nước.'},
 {id:'shark',x:.22,y:.67,name:'Rạn Vây Bạc',icon:'🦈',description:'Vây cá mập lặng lẽ vẽ những vòng tròn trên mặt biển.'},
 {id:'octopus',x:.70,y:.70,name:'Vịnh Tám Tay',icon:'🐙',description:'Bạch tuộc tím đang canh một chiếc rương đầy vỏ sò.'},
] as const;
// Conservative shoreline masks; discoveries sit in navigable water off shore.
const land=[{x:.08,y:.15,rx:.18,ry:.15},{x:.445,y:.18,rx:.105,ry:.16},{x:.87,y:.15,rx:.19,ry:.20},{x:.91,y:.76,rx:.17,ry:.22},{x:.10,y:.86,rx:.11,ry:.11}];
export const start:Point={x:.5,y:.55};
export function canSail(p:Point){return p.x>=.035&&p.x<=.965&&p.y>=.04&&p.y<=.95&&!land.some(l=>((p.x-l.x)/l.rx)**2+((p.y-l.y)/l.ry)**2<1);}
export function advance(p:Point,dx:number,dy:number,dt:number):Point{
 const length=Math.hypot(dx,dy);if(!length)return p;
 const step=Math.max(0,Math.min(dt,.05))*.12;
 const next={x:p.x+dx/length*step,y:p.y+dy/length*step};
 if(canSail(next))return next;
 const slideX={x:next.x,y:p.y};if(canSail(slideX))return slideX;
 const slideY={x:p.x,y:next.y};return canSail(slideY)?slideY:p;
}
export function nearby(p:Point){return landmarks.find(l=>Math.hypot(l.x-p.x,l.y-p.y)<.095);}
export function parseJournal(raw:string|null):string[]{try{const value=JSON.parse(raw||'null');return value?.version===1&&Array.isArray(value.discoveries)?[...new Set<string>(value.discoveries.filter((id:unknown)=>typeof id==='string'&&landmarks.some(l=>l.id===id)))]:[];}catch{return [];}}
