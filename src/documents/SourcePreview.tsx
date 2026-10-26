import {useEffect,useMemo,useState} from 'react';
import {highlightSource,type HighlightedSource} from './sourceHighlight.ts';

export default function SourcePreview({name,data}:{name:string;data:Uint8Array}){
  const source=useMemo(()=>{
    if(data.byteLength>1024*1024)return {error:'File quá lớn để xem mã nguồn (tối đa 1 MB).'};
    try{
      const text=new TextDecoder('utf-8',{fatal:true}).decode(data);
      if(/[\x00-\x08\x0e-\x1f]/.test(text))return {error:'File nhị phân chưa hỗ trợ xem trực tiếp.'};
      return {text};
    }catch{return {error:'File này không phải văn bản UTF-8, chưa hỗ trợ xem trực tiếp.'};}
  },[name,data]);
  const [highlighted,setHighlighted]=useState<{source:typeof source;value:HighlightedSource}|null>(null);
  useEffect(()=>{
    let active=true;
    if(source.text!==undefined)void highlightSource(name,source.text).then(value=>{if(active)setHighlighted({source,value});}).catch(()=>{if(active)setHighlighted(null);});
    return()=>{active=false;};
  },[name,source]);
  if(source.error)return <p role="status">{source.error}</p>;
  const value=highlighted?.source===source?highlighted.value:null;
  return <>{value?.plainTail&&<p className="document-source-notice" role="status">File dài: tô màu {value.highlightedCharacters.toLocaleString('vi-VN')} ký tự đầu; phần còn lại vẫn hiển thị đầy đủ.</p>}<div className="document-source" aria-label={`Mã nguồn ${name}`}>
    <pre className="document-source-lines" aria-hidden="true">{Array.from({length:source.text!.split('\n').length},(_,i)=>i+1).join('\n')}</pre>
    <pre className="document-source-code">{value?<><code className={`language-${value.language}`} dangerouslySetInnerHTML={{__html:value.html}}/><code>{value.plainTail}</code></>:<code>{source.text}</code>}</pre>
  </div></>;
}
