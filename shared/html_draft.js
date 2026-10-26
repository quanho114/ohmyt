// Display-only decoding of a possibly incomplete tool argument string.
// Never executes code or supplies arguments to the invocation pipeline.
export function htmlDraft(argumentsText) {
  if(typeof argumentsText!=='string'||argumentsText.length>2200000)return null;
  const fields={};
  let i=0;
  const string=()=>{
    let text='';i++;
    while(i<argumentsText.length){
      const c=argumentsText[i++];
      if(c==='"')return {text,closed:true};
      if(c!=='\\'){text+=c;continue;}
      if(i===argumentsText.length)break;
      const escaped=argumentsText[i++];
      if(escaped==='u'){
        const hex=argumentsText.slice(i,i+4);if(!/^[0-9a-f]{4}$/i.test(hex))break;
        text+=String.fromCharCode(parseInt(hex,16));i+=4;
      }else{
        const escapes={'"':'"','\\':'\\','/':'/','n':'\n','r':'\r','t':'\t','b':'\b','f':'\f'};
        if(!(escaped in escapes))break;text+=escapes[escaped];
      }
    }
    return {text,closed:false};
  };
  while(i<argumentsText.length){
    const c=argumentsText[i];
    if(c!=='"'){i++;continue;}
    const key=string();if(!key.closed)break;
    while(/\s/.test(argumentsText[i]||'')&&i<argumentsText.length)i++;
    if(argumentsText[i++]!==':')continue;
    while(/\s/.test(argumentsText[i]||'')&&i<argumentsText.length)i++;
    if(argumentsText[i]!=='"')continue;
    const value=string();
    if(key.text==='name'||key.text==='content')fields[key.text]=value.text;
    if(!value.closed)break;
  }
  return typeof fields.content==='string'?{name:fields.name||'preview.html',content:fields.content}:null;
}
