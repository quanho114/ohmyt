// Literal, bounded retrieval shared by extracted documents and tool artifacts.
// No execution, network access, inferred facts or cross-session cache.
export function lookupText(content,{query,offset=0,limit=2000}={}) {
  if(typeof content!=='string'||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<2||limit>4000)throw Error('Invalid source range');
  if(query!==undefined&&(typeof query!=='string'||!query.trim()||query.length>300))throw Error('Invalid source query');
  const high=n=>n>=0xd800&&n<=0xdbff,low=n=>n>=0xdc00&&n<=0xdfff;
  let start=Math.min(offset,content.length),found;
  if(query!==undefined){
    // Exact literal matching keeps returned offsets faithful to source text.
    found=content.indexOf(query,start);
    if(found<0)return {content:'',found:false,offset:start,nextOffset:null,totalCharacters:content.length,notice:'No exact match in this snapshot. This does not prove absence from the original document.'};
    const line=content.lastIndexOf('\n',found);
    start=Math.max(start,line+1,found-Math.floor(limit/4));
  }
  if(start>0&&low(content.charCodeAt(start))&&high(content.charCodeAt(start-1)))start--;
  let end=Math.min(start+limit,content.length);
  if(end<content.length&&high(content.charCodeAt(end-1))&&low(content.charCodeAt(end)))end--;
  let lineNumber=1;
  if(found!==undefined)for(let i=0;i<found;i++)if(content.charCodeAt(i)===10)lineNumber++;
  return {content:content.slice(start,end),offset:start,nextOffset:end<content.length?end:null,totalCharacters:content.length,...(query!==undefined?{found:true,matchOffset:found,line:lineNumber}:{})};
}
