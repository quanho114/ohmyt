import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {fetch as guardedFetch,ProxyAgent} from 'undici';
import {BrowserEgress} from '../browser_egress.js';
export function validateConnection(config){
  if(!config||typeof config.id!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.id)||!['stdio','http'].includes(config.transport))throw new Error('Invalid MCP configuration');
  if(config.transport==='stdio'){
    if(typeof config.command!=='string'||!config.command||!Array.isArray(config.args)||config.args.some(arg=>typeof arg!=='string')||config.args.length>100)throw new Error('Invalid MCP command');
    if(/^(?:ba|z|fi|da|k)?sh$|^(?:cmd|powershell|pwsh)(?:\.exe)?$/i.test(path.basename(config.command)))throw new Error('MCP shell commands are not supported; use a direct executable');
  }else{
    const url=new URL(config.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Invalid MCP endpoint');
  }
  return config;
}
export class McpConnection {
  constructor(config,{token}={}){this.config=validateConnection(config);this.token=token;this.client=new Client({name:'ohmyt',version:'1.0.0'});this.closed=false;this.failed=false;this.client.onclose=()=>{if(!this.closed)this.failed=true;};this.client.onerror=()=>{this.failed=true;};}
  async connect(){
    const c=this.config;
    try{
      if(c.transport==='stdio')this.transport=new StdioClientTransport({command:c.command,args:c.args,stderr:'pipe',maxBufferSize:1024*1024});
      else{
        const endpoint=new URL(c.url),loopback=['127.0.0.1','[::1]'].includes(endpoint.hostname);
        if(!loopback){this.egress=new BrowserEgress();await this.egress.start();this.dispatcher=new ProxyAgent(this.egress.url);}
        const fetch=async(input,options)=>{const url=new URL(typeof input==='string'?input:input.url || String(input));if(url.origin!==endpoint.origin)throw new Error('MCP origin change denied');return guardedFetch(url,{...options,redirect:'error',...(this.dispatcher?{dispatcher:this.dispatcher}:{})});};
        this.transport=new StreamableHTTPClientTransport(endpoint,{fetch,requestInit:{headers:this.token?{Authorization:`Bearer ${this.token}`}:{}}});
      }
      this.transport.stderr?.on('data',()=>{});
      await this.client.connect(this.transport,{timeout:10000});return this;
    }catch(error){await this.close();throw error;}
  }
  async listTools(){
    const definitions=[],seen=new Set();let cursor,pages=0;const signal=AbortSignal.timeout(10000);
    do{if(++pages>20||seen.has(cursor))throw new Error('MCP tool pagination exceeds limit');seen.add(cursor);const page=await this.client.listTools(cursor?{cursor}:undefined,{timeout:10000,signal});definitions.push(...page.tools);cursor=page.nextCursor;if(definitions.length>100)throw new Error('MCP tool catalog exceeds limit');}while(cursor);
    const names=new Set();for(const definition of definitions){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(definition.name)||names.has(definition.name)||JSON.stringify(definition.inputSchema).length>65536)throw new Error('Invalid MCP tool definition');names.add(definition.name);}return definitions;
  }
  async listResources(){const resources=[],seen=new Set();let cursor,pages=0;const signal=AbortSignal.timeout(10000);try{do{if(++pages>20||seen.has(cursor))throw new Error('MCP resource pagination exceeds limit');seen.add(cursor);const page=await this.client.listResources(cursor?{cursor}:undefined,{timeout:10000,signal});resources.push(...page.resources);cursor=page.nextCursor;if(resources.length>100)throw new Error('MCP resource catalog exceeds limit');}while(cursor);}catch(error){if(error.code===-32601)return [];throw error;}return resources;}
  async readResource(uri,signal){if(this.closed||this.failed)throw new Error('MCP connection unavailable; reconnect in Settings');signal?.throwIfAborted();const result=await this.client.readResource({uri},{signal,timeout:30000});if(JSON.stringify(result).length>1024*1024)throw new Error('MCP resource exceeds output limit');return {untrusted:true,contents:result.contents};}
  async call(name,args,signal){if(this.closed||this.failed)throw new Error('MCP connection unavailable; reconnect in Settings');signal?.throwIfAborted();const result=await this.client.callTool({name,arguments:args},undefined,{signal,timeout:30000});if(JSON.stringify(result).length>1024*1024)throw new Error('MCP result exceeds output limit');return result;}
  async close(){if(this.closed)return;this.closed=true;try{await this.client.close();}finally{await this.dispatcher?.destroy();await this.egress?.close();}}
}
