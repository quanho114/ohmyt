export const toolGroup=name=>name.startsWith('browser_')?'browser':name.startsWith('memory_')?'memory':name.startsWith('web_')?'web':'workspace';

export function workspaceToolsPlugin({tools,group}){
  if(!['workspace','browser','web','memory'].includes(group))throw new Error('Invalid tool group');
  const entries=[...tools.tools.values()].filter(tool=>toolGroup(tool.name)===group);
  return {name:`tools/${group}`,inject:['tools'],apply:ctx=>{
    if(group==='browser')ctx.effect(()=>{tools.browserToolOwner=ctx;return ()=>{if(tools.browserToolOwner===ctx)tools.browserToolOwner=null;};});
    const adopted=new Map(entries.map(tool=>[tool.name,tool]));
    for(const tool of tools.tools.values())if(toolGroup(tool.name)===group)adopted.set(tool.name,tool);
    for(const tool of adopted.values())ctx.effect(()=>{
      if(ctx.tools.get(tool.name)===tool)ctx.tools.tools.delete(tool.name);
      return ctx.tools.register(tool);
    },`tool:${tool.name}`);
  }};
}
