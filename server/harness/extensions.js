import {validateArguments} from './schema.js';
const stateNames=['pending','loading','active','failed','disposed','unloading'];
const labels={'tools/workspace':'Tệp và môi trường chạy','tools/browser':'Trình duyệt','tools/memory':'Bộ nhớ','tools/web':'Tìm kiếm web','skills/catalog':'Danh mục kỹ năng','tools/ptc':'Thực thi chương trình','agents/subagents':'Agent con','artifacts/store':'Tài liệu được tạo'};
export class Extensions {
  constructor(database,host){this.db=database.db;this.host=host;this.db.exec('CREATE TABLE IF NOT EXISTS harness_extensions(id TEXT PRIMARY KEY,enabled INTEGER NOT NULL,config TEXT NOT NULL,revision INTEGER NOT NULL);');}
  list(){return [...this.host.definitions].map(([id,plugin])=>{
    const saved=this.db.prepare('SELECT * FROM harness_extensions WHERE id=?').get(id),fiber=this.host.plugins.get(id);
    return {id,name:plugin.manifest?.name || labels[id] || id,source:'local',builtin:!plugin.manifest,capabilities:plugin.manifest?.capabilities || [],dependencies:Object.keys(typeof plugin.inject==='object'&&!Array.isArray(plugin.inject)?plugin.inject:Object.fromEntries((plugin.inject || []).map(key=>[key,true]))),enabled:Boolean(fiber),availability:id==='tools/ptc'?this.host.ptcStatus:null,state:id==='tools/ptc'&&this.host.ptcStatus?.available===false?'unavailable':fiber?stateNames[fiber.state] || 'unknown':'disabled',revision:saved?.revision || 1,config:JSON.parse(saved?.config || '{}'),configSchema:plugin.manifest?.configSchema || null,readonly:id.startsWith('core/')||id.startsWith('prompt/')||id.startsWith('connector/'),description:plugin.manifest?.description || ''};
  });}
  get(id){return this.list().find(e=>e.id===id);}
  async update(id,{enabled,config,expectedVersion}){
    const current=this.get(id);if(!current)throw Object.assign(new Error('Extension unavailable'),{statusCode:404});
    if(current.readonly)throw Object.assign(new Error('Core service cannot be disabled'),{statusCode:400});
    if(expectedVersion!==current.revision)throw Object.assign(new Error('Cấu hình đã thay đổi. Tải lại trước khi lưu.'),{statusCode:409});
    if(typeof enabled!=='boolean')throw Object.assign(new Error('Invalid enabled state'),{statusCode:400});
    const nextConfig=config ?? current.config,plugin=this.host.definitions.get(id);
    if(current.configSchema)validateArguments(current.configSchema,nextConfig);else if(Object.keys(nextConfig).length)throw Object.assign(new Error('This extension has no editable configuration'),{statusCode:400});
    if(!enabled){const dependents=this.list().filter(e=>e.enabled && this.host.definitions.get(e.id).manifest?.requires?.includes(id));if(dependents.length)throw Object.assign(new Error(`Required by: ${dependents.map(e=>e.name).join(', ')}`),{statusCode:409});}
    await this.host.changePlugins(async()=>{
      const fiber=this.host.plugins.get(id);if(fiber){await fiber.dispose();this.host.plugins.delete(id);}
      try{
        if(enabled){const next=this.host._mount(plugin,nextConfig);await next.await();if(next.state!==2)throw new Error('Extension activation failed');}
        this.db.prepare('INSERT INTO harness_extensions VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,config=excluded.config,revision=excluded.revision').run(id,Number(enabled),JSON.stringify(nextConfig),current.revision+1);
      }catch(error){const partial=this.host.plugins.get(id);if(partial){await partial.dispose();this.host.plugins.delete(id);}if(current.enabled){const restored=this.host._mount(plugin,current.config);await restored.await();}throw error;}
    });
    return this.get(id);
  }
  async restore(){for(const row of this.db.prepare('SELECT * FROM harness_extensions').all()){const plugin=this.host.definitions.get(row.id);if(!plugin||row.id.startsWith('core/')||row.id.startsWith('prompt/'))continue;const fiber=this.host.plugins.get(row.id);if(fiber){await fiber.dispose();this.host.plugins.delete(row.id);}if(row.enabled){const next=this.host._mount(plugin,JSON.parse(row.config));await next.await();if(next.state!==2)throw new Error(`Saved extension failed: ${row.id}`);}}}
}
