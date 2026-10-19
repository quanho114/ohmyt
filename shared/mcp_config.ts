/** Parse one server without silently discarding unsupported authentication or environment. */
export function parseMcpConfig(source:string){
  const root=JSON.parse(source);
  if(!root||typeof root!=='object'||Array.isArray(root))throw new Error('Expected a JSON object');
  let name='';let entry=root;
  if('mcpServers' in root){
    if(!root.mcpServers||typeof root.mcpServers!=='object'||Array.isArray(root.mcpServers))throw new Error('Invalid mcpServers');
    const entries=Object.entries(root.mcpServers);
    if(entries.length!==1)throw new Error('Paste exactly one server at a time');
    [name,entry]=entries[0];
  }
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error('Invalid server configuration');
  for(const key of Object.keys(entry))if(!['name','type','transport','url','command','args','token'].includes(key))throw new Error(`Unsupported field: ${key}. Configure this server manually; no fields were imported.`);
  const transport=entry.transport||entry.type||(entry.url?'http':'stdio');
  if(!['stdio','http','streamable-http'].includes(transport))throw new Error('Only stdio and Streamable HTTP are supported');
  if(transport==='stdio'){
    if(typeof entry.command!=='string'||!entry.command.trim()||entry.url)throw new Error('Expected a command for stdio');
    if(entry.args!==undefined&&(!Array.isArray(entry.args)||entry.args.some((v:unknown)=>typeof v!=='string'||v.includes('\n'))))throw new Error('Arguments must be strings without newlines');
  }else if(typeof entry.url!=='string'||entry.command)throw new Error('Expected a URL for HTTP');
  if(entry.token!==undefined&&typeof entry.token!=='string')throw new Error('Invalid token');
  if(entry.name!==undefined&&typeof entry.name!=='string')throw new Error('Invalid name');
  return {name:name||entry.name||'',transport:(transport==='stdio'?'stdio':'http') as 'stdio'|'http',url:entry.url||'',command:entry.command||'',args:(entry.args||[]).join('\n'),token:entry.token||''};
}
