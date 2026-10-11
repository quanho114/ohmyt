// MCP stdio transport bound to an existing authorized ohmyt parent run.
import readline from 'node:readline';
const base=new URL(process.env.OHMYT_MCP_API || 'http://127.0.0.1:3188/api/');
if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password)throw Error('MCP requires a local ohmyt API.');
const runId=process.env.OHMYT_MCP_RUN,sessionId=process.env.OHMYT_MCP_CHAT;
if(!runId||!sessionId)throw Error('Set OHMYT_MCP_RUN and OHMYT_MCP_CHAT to the parent run.');
const endpoint=new URL('browser-use/mcp',base);endpoint.searchParams.set('runId',runId);endpoint.searchParams.set('sessionId',sessionId);
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of lines){
  let request;
  try{
    if(Buffer.byteLength(line)>131072)throw Error('Request too large');request=JSON.parse(line);
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.OHMYT_MCP_TOKEN?{Authorization:`Bearer ${process.env.OHMYT_MCP_TOKEN}`}:{})},body:JSON.stringify(request),signal:AbortSignal.timeout(10*60*1000)});
    if(response.status===204)continue;
    if(!response.ok)throw Error('Parent API rejected request');
    const result=await response.json();process.stdout.write(JSON.stringify(result)+'\n');
  }catch{if(request?.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32000,message:'Parent browser API unavailable or request rejected'}})+'\n');}
}
