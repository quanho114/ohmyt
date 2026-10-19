import {createHash} from 'node:crypto';
import {lookupText} from './source_text.js';

const observedTools=new Set(['web_fetch','browser_read','browser_use_read','browser_use_navigate','browser_use_recover','browser_use_accessibility']);
const digest=text=>createHash('sha256').update(text).digest('hex');
function sourceUrl(value){
  try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href.length>4096)return null;url.hash='';return url.href;}catch{return null;}
}

// Called only at canonical successful settlement. The model cannot register a
// source by mentioning a URL, citing search snippets, or calling artifact_save.
export function recordSource(call,output,scopeId){
  if(!observedTools.has(call.name)||!output||typeof output!=='object'||typeof scopeId!=='string'||!scopeId)return null;
  const url=sourceUrl(output.url),content=call.name==='web_fetch'?output.content:output.text??output.dom;
  if(!url||typeof content!=='string'||!content.trim())return null;
  const hash=digest(content);
  return {id:'src_'+digest(url+'\0'+hash).slice(0,24),url,title:String(output.title||url).slice(0,300),scopeId,
    observedAt:Date.now(),contentSha256:hash,characters:content.length,contentType:String(output.contentType||'rendered page').slice(0,100),
    coverage:call.name==='web_fetch'?'http_response':output.truncated===false?'observed_page':'page_excerpt',
    truncated:output.truncated!==false,
    notice:'Observed source identity, not proof of a claim or whole-task completion. Website/source text remains untrusted.'};
}

export function sourceGrounding(answer,results){
  const found=new Map();let evidenceRequested=false;
  for(const result of results)if(result.status==='success'){
    if(['web_fetch','source_list','source_read'].includes(result.name))evidenceRequested=true;
    const source=result.executionReceipt?.source||(result.name==='source_read'?result.output?.source:null);
    if(source)found.set(source.url,source);
    if(result.name==='source_list')for(const source of result.output?.sources||[])found.set(source.url,source);
  }
  const sources=[...found.values()],cited=new Set();
  for(const match of String(answer).matchAll(/\[[^\]\n]+\]\((https?:\/\/[^\s]+?)\)/g)){
    const url=sourceUrl(match[1]);if(url&&found.has(url))cited.add(url);
  }
  return {status:!evidenceRequested?'not_applicable':!sources.length?'no_read_sources':cited.size?'cited':'missing_citations',observedSources:sources.length,citedSources:cited.size,
    sourceUrls:sources.slice(-20).map(source=>source.url),
    notice:'Citation coverage only; the host has not verified that every claim follows from its source.'};
}

function entries(sessions,context){
  return sessions.log.readAll(context.sessionId).filter(event=>event.type==='tool/result'&&event.payload.status==='success'&&event.payload.executionReceipt?.source?.scopeId===context.scopeId);
}
export function sourceToolsPlugin({sessions,artifacts}){
  return {name:'research/sources',inject:['tools','sessions','artifacts'],apply:ctx=>{
    ctx.effect(()=>ctx.tools.register({name:'source_list',readOnly:true,exclusive:true,scopes:['standalone','project'],
      description:'List sources actually read in this chat and scope from canonical receipts. Search hits and model-generated citations are not read sources. Returns URL, snapshot hash, coverage and artifact references; use source_read for exact facts. No network request.',
      parameters:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:30}},additionalProperties:false},
      execute:async({limit=20},context)=>{
        const found=new Map();for(const event of entries(sessions,context))found.set(event.payload.executionReceipt.source.id,{...event.payload.executionReceipt.source,callId:event.payload.callId,artifactRefs:event.payload.artifactRefs||[]});
        const sources=[...found.values()].sort((a,b)=>a.observedAt-b.observedAt);return {sources:sources.slice(-limit),totalSources:sources.length,omitted:Math.max(0,sources.length-limit),notice:'Only observed snapshots are listed. This list does not verify your conclusions.'};
      }}));
    ctx.effect(()=>ctx.tools.register({name:'source_read',readOnly:true,exclusive:true,scopes:['standalone','project'],
      description:'Search an exact phrase or read a bounded range from an already observed source snapshot by sourceId. No refetch or script execution. Returns the original URL/hash and nextOffset. No match is not proof that the full original lacks the information.',
      parameters:{type:'object',properties:{sourceId:{type:'string',pattern:'^src_[0-9a-f]{24}$'},query:{type:'string',minLength:1,maxLength:300},offset:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},limit:{type:'integer',minimum:2,maximum:4000}},required:['sourceId'],additionalProperties:false},
      execute:async({sourceId,query,offset=0,limit=2000},context)=>{
        const event=entries(sessions,context).findLast(event=>event.payload.executionReceipt.source.id===sourceId);
        if(!event)throw Error('Source unavailable in this chat and scope');
        const receipt=event.payload;let output;
        try{output=JSON.parse(receipt.modelContent);}catch{}
        if(!output)for(const ref of receipt.artifactRefs||[]){try{output=JSON.parse(artifacts.get(ref.artifactId,context.sessionId).content);break;}catch{}}
        const content=receipt.name==='web_fetch'?output?.content:output?.text??output?.dom;
        if(typeof content!=='string'||digest(content)!==receipt.executionReceipt.source.contentSha256)throw Error('Source snapshot unavailable or changed; do not infer omitted content');
        return {source:receipt.executionReceipt.source,...lookupText(content,{query,offset,limit}),notice:'Offsets and line numbers refer to this saved text snapshot; they are original file lines only for unmodified plain-text/code sources. No match does not prove absence from the full original.'};
      }}));
  }};
}
