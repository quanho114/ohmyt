import {freezeValue} from './prompt.js';
import {validateToolResult} from './contracts.js';
import {createHash} from 'node:crypto';

// The receipt owns the observation. Images are transient supplementary context.
export function toolResult(callId,status,output,startedAt,receipt={},presentation={}){
  const content=typeof output==='string'?output:JSON.stringify(output ?? null,(key,value)=>key==='dataUrl'||key==='image_url'?undefined:value);
  const maxChars=Math.max(600,presentation.maxChars || 12000),artifactRefs=[];
  let modelContent=content;
  if(content.length>maxChars){
    const hash=createHash('sha256').update(content).digest('hex'),bytes=Buffer.byteLength(content);
    let locator='Full output unavailable';
    if(presentation.save){
      let artifact;try{artifact=presentation.save(content);}catch{ /* Presentation failure cannot change an already executed body outcome. */ }
      if(artifact){artifactRefs.push({...artifact,sha256:hash,bytes});locator=`Full output artifact: ${artifact.artifactId} (sha256:${hash}, ${bytes} bytes)`;}
    }
    modelContent=content.slice(0,Math.max(0,maxChars-350))+`\n[Tool output truncated. ${locator}. Do not infer omitted facts.]`;
  }
  return freezeValue(validateToolResult({callId,status,modelContent,artifactRefs,executionReceipt:{version:2,status,startedAt,endedAt:Date.now(),...receipt},output}));
}
