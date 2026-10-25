import './islandSea.css';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Anchor,BookOpen,Compass,Pause,Play,X,Waves,Sun,EyeOff,Check} from 'lucide-react';
import {SeaLife} from './SeaLife.tsx';
import {creatures,projectPoint,type Creature} from './life.ts';
import {advance,landmarks,nearby,parseJournal,start,type Point} from './world.ts';
import type {Appearance} from '../appearance.ts';
const JOURNAL='ohmyt-island-journal-v1';
export function IslandSea({mode,onMode}:{mode:Appearance['islandSea'];onMode:(mode:Appearance['islandSea'])=>void}){
 const [reaction,setReaction]=useState<{kind:Creature;revision:number}|null>(null);
 const [assetError,setAssetError]=useState(false);
 const [playing,setPlaying]=useState(false),[paused,setPaused]=useState(false),[journal,setJournal]=useState(false),[notice,setNotice]=useState('');
 const [discoveries,setDiscoveries]=useState<string[]>(()=>{try{return parseJournal(localStorage.getItem(JOURNAL));}catch{return [];}});
 const [near,setNear]=useState<ReturnType<typeof nearby>>();
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [visible,setVisible]=useState(!document.hidden);
 const boat=useRef<HTMLDivElement>(null),position=useRef<Point>({...start}),keys=useRef(new Set<string>()),launch=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDivElement>(null),nearRef=useRef<ReturnType<typeof nearby>>(undefined);
 const interact=(kind:Creature)=>{
  setReaction(previous=>({kind,revision:(previous?.revision||0)+1}));
  const messages={birds:'Đàn chim bay vòng quanh buồm, ríu rít chào bạn.',shark:'Cá mập tò mò đổi hướng, chiếc vây rẽ một vệt nước mảnh.',dinosaur:'Khủng long ngẩng đầu nhìn ra bờ biển, chào người bạn mới.',octopus:'Bạch tuộc nổi lên, vẫy xúc tu bên chiếc rương nhỏ.'};
  setNotice(messages[kind]);
 };
 const discover=()=>{
  const item=nearby(position.current);if(!item)return;
  if(creatures.includes(item.id as Creature))setReaction(previous=>({kind:item.id as Creature,revision:(previous?.revision||0)+1}));
  if(discoveries.includes(item.id)){setNotice(item.description);return;}
  const next=[...discoveries,item.id];setDiscoveries(next);
  try{localStorage.setItem(JOURNAL,JSON.stringify({version:1,discoveries:next}));setNotice(`Đã khám phá · ${item.name}`);}
  catch{setNotice(`${item.name} · chưa lưu được nhật ký`);}
 };
 const close=()=>{setPlaying(false);setPaused(false);setJournal(false);keys.current.clear();requestAnimationFrame(()=>launch.current?.focus());};
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useEffect(()=>{const change=()=>{setVisible(!document.hidden);keys.current.clear();if(document.hidden)setPaused(true);};const blur=()=>{setVisible(false);keys.current.clear();if(playing)setPaused(true);};const focus=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',change);window.addEventListener('blur',blur);window.addEventListener('focus',focus);return()=>{document.removeEventListener('visibilitychange',change);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);};},[playing]);
 useEffect(()=>{if(!playing)return;dialog.current?.focus();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;keys.current.clear();};},[playing]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{
  let raf=0,last=0,elapsed=0,width=1,height=1;
  const parent=boat.current?.parentElement;
  const observer=new ResizeObserver(entries=>{const size=entries[0]?.contentRect;if(size){width=size.width;height=size.height;}});
  if(parent){const bounds=parent.getBoundingClientRect();width=bounds.width;height=bounds.height;observer.observe(parent);}
  const animate=(time:number)=>{
   raf=requestAnimationFrame(animate);if(time-last<33)return;const dt=last?Math.min((time-last)/1000,.05):0;last=time;elapsed+=dt;
   const previous={...position.current};
   if(playing){if(!paused&&!journal){const k=keys.current;position.current=advance(position.current,Number(k.has('ArrowRight')||k.has('d'))-Number(k.has('ArrowLeft')||k.has('a')),Number(k.has('ArrowDown')||k.has('s'))-Number(k.has('ArrowUp')||k.has('w')),dt);}}
   else position.current={x:.60+Math.sin(elapsed*.12)*.07,y:.30+Math.cos(elapsed*.16)*.025};
   if(boat.current){const point=projectPoint(position.current,width,height,playing);boat.current.style.left=`${point.x/width*100}%`;boat.current.style.top=`${point.y/height*100}%`;const dx=position.current.x-previous.x;if(Math.abs(dx)>.00001)boat.current.style.setProperty('--boat-facing',dx<0?'-1':'1');}
   const item=nearby(position.current);if(item?.id!==nearRef.current?.id){nearRef.current=item;setNear(item);}
  };
  if(visible&&mode!=='off'&&((playing&&!paused&&!journal)||(!playing&&!reduced&&mode==='ambient')))raf=requestAnimationFrame(animate);
  return()=>{cancelAnimationFrame(raf);observer.disconnect();};
 },[playing,paused,journal,visible,mode,reduced]);
 const scene=(full:boolean)=><div className={`island-world ${full?'island-world-play':'island-world-ambient'}`} data-moving={visible&&!paused&&!journal&&!reduced&&mode==='ambient'}>
  <img className="island-map" src="/island-sea/scenery.png" alt={full?'Quần đảo với khủng long, chim biển, cá mập và bạch tuộc':'Biển đảo tí hon'} draggable={false} onError={()=>setAssetError(true)}/>
  <SeaLife full={full} running={visible&&(full?!paused&&!journal:!reduced&&mode==='ambient')} decorative={!reduced&&mode==='ambient'} boat={position} reaction={reaction} onInteract={interact} onError={()=>{setAssetError(true);setNotice('Chưa tải được hình sinh vật · hãy tải lại trang');}}/>
  {full&&landmarks.map(l=><div key={l.id} className={`island-marker ${discoveries.includes(l.id)?'is-discovered':''}`} style={{left:`${l.x*100}%`,top:`${l.y*100}%`}} aria-hidden="true">{discoveries.includes(l.id)?'✦':'◇'}</div>)}
  <div ref={boat} className="island-boat" style={{left:`${position.current.x*100}%`,top:`${position.current.y*100}%`}} aria-hidden="true"><span className="island-hull"><img src="/island-sea/boat.png" alt="" draggable={false} onError={()=>setAssetError(true)}/></span></div>

 </div>;
 return <section className="island-sea" data-mode={mode} data-playing={playing} data-reduced={reduced} aria-label="Biển đảo tí hon">
  {mode!=='off'&&!playing&&scene(false)}
  <div className="island-home-controls">{assetError&&<span role="status" className="island-asset-error">Chưa tải được cảnh biển · hãy tải lại trang</span>}<details className="island-mode-menu" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))e.currentTarget.open=false;}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}><summary aria-label="Tùy chọn biển đảo" title="Tùy chọn biển đảo">{mode==='off'?<EyeOff size={15}/>:mode==='static'?<Sun size={15}/>:<Waves size={15}/>}</summary><div className="island-mode-options" role="group" aria-label="Chế độ biển đảo"><span>CẢNH BIỂN</span>{([{value:'ambient',label:'Sống động',Icon:Waves},{value:'static',label:'Tĩnh lặng',Icon:Sun},{value:'off',label:'Ẩn cảnh biển',Icon:EyeOff}] as const).map(({value,label,Icon})=><button key={value} type="button" aria-pressed={mode===value} onClick={e=>{onMode(value);const menu=e.currentTarget.closest('details');if(menu){menu.open=false;menu.querySelector('summary')?.focus();}}}><Icon size={14}/><span>{label}</span>{mode===value&&<Check size={13}/>}</button>)}</div></details><span className="island-control-divider" aria-hidden="true"/>{mode!=='off'&&<button ref={launch} className="island-launch" title="Ra khơi" aria-label="Ra khơi" disabled={assetError} onClick={()=>{position.current={...start};setPaused(false);setPlaying(true);}}><Compass size={16}/></button>}</div>
  {playing&&createPortal(<div className="island-game-backdrop"><div ref={dialog} className="island-game" role="dialog" aria-modal="true" aria-label="Ra khơi · Biển đảo tí hon" tabIndex={-1} onKeyDown={e=>{
   if(e.key==='Tab'){const nodes=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),select')];if(!nodes.length)return;const index=nodes.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&(index<=0)){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&(index===nodes.length-1)){e.preventDefault();nodes[0]?.focus();}return;}
   if(e.key==='Escape'){e.preventDefault();journal?setJournal(false):close();return;}
   const key=e.key.length===1?e.key.toLowerCase():e.key;
   if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(key)){e.preventDefault();keys.current.add(key);}
   if((e.key==='e'||e.key===' ')&&!e.repeat&&e.target===e.currentTarget){e.preventDefault();if(!paused&&!journal)discover();}
  }} onKeyUp={e=>keys.current.delete(e.key.length===1?e.key.toLowerCase():e.key)}>
   <header className="island-game-header"><div><Anchor size={19}/><strong>Biển đảo tí hon</strong><span>Khám phá theo nhịp của bạn</span></div><nav><button onClick={()=>{keys.current.clear();setJournal(v=>!v);}}><BookOpen size={15}/>Nhật ký {discoveries.length}/{landmarks.length}</button><button aria-label={paused?'Tiếp tục hải trình':'Tạm dừng hải trình'} onClick={()=>{keys.current.clear();setPaused(v=>!v);}}>{paused?<Play size={16}/>:<Pause size={16}/>}</button><button onClick={close}><X size={16}/>Về chat</button></nav></header>
   <div className="island-playfield">{scene(true)}{paused&&!journal&&<div className="island-pause"><strong>Thả neo một chút</strong><button onClick={()=>{setPaused(false);dialog.current?.focus();}}>Tiếp tục hải trình</button></div>}{journal&&<aside className="island-journal"><header><h2>Nhật ký hải trình</h2><button aria-label="Đóng nhật ký" onClick={()=>setJournal(false)}><X size={16}/></button></header>{landmarks.map(l=><article key={l.id}><span>{discoveries.includes(l.id)?l.icon:'◇'}</span><div><strong>{discoveries.includes(l.id)?l.name:'Vùng biển chưa khám phá'}</strong><p>{discoveries.includes(l.id)?l.description:'Lái thuyền tới dấu ◇ và chọn Khám phá.'}</p></div></article>)}</aside>}</div>
   <footer className="island-game-footer"><span>WASD / mũi tên · E khám phá · bấm sinh vật để chào · Esc về chat</span><button disabled={!near||paused||journal} onClick={discover}>{near?`Khám phá ${near.name}`:'Đi tới dấu ◇ trên biển'}</button></footer>
   {notice&&<p className="island-discovery" role="status">{notice}</p>}
  </div></div>,document.body)}
 </section>;
}
