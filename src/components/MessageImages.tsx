import React, {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import type {ImageAttachment} from '../types.ts';
export function MessageImages({images,onRemove}:{images:ImageAttachment[];onRemove?:(index:number)=>void}) {
  const [selected,setSelected]=useState<ImageAttachment|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(selected)dialog.current?.showModal();},[selected]);
  if(!images.length)return null;
  return <><div className={`message-images${onRemove?' is-draft':''}`}>{images.map((image,index)=><div className="message-image" key={index}>
    <button type="button" className="message-image-open" aria-label={`Xem ảnh ${index+1}: ${image.name}`} onClick={()=>setSelected(image)}><img src={image.dataUrl} alt={image.name}/></button>
    {onRemove&&<button type="button" className="message-image-remove" aria-label={`Bỏ ảnh ${index+1}`} onClick={()=>onRemove(index)}><X size={13}/></button>}
  </div>)}</div>{selected&&createPortal(<dialog ref={dialog} className="message-image-dialog" onCancel={()=>setSelected(null)}><header><span>{selected.name}</span><button type="button" autoFocus aria-label="Đóng ảnh" onClick={()=>setSelected(null)}><X size={20}/></button></header><img src={selected.dataUrl} alt={selected.name}/></dialog>,document.body)}</>;
}
