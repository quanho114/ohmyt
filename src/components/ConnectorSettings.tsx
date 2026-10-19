import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Plus,RefreshCw,Server,Globe} from 'lucide-react';
import {api,type ConnectorItem} from '../api.ts';
import {parseMcpConfig} from '../../shared/mcp_config.ts';
import type {SettingsLocale} from '../appearance.ts';

const emptyForm=()=>({id:`connection_${crypto.randomUUID().replaceAll('-','')}`,name:'',transport:'http' as 'http'|'stdio',url:'',command:'',args:'',scopeId:'standalone',token:''});

export function ConnectorSettings({locale}:{locale:SettingsLocale}){
  const en=locale==='en';
  const [items,setItems]=useState<ConnectorItem[]>([]),[projects,setProjects]=useState<{id:string;name:string}[]>([]);
  const [editing,setEditing]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState('');
  const [expectedRevision,setExpectedRevision]=useState(0),[form,setForm]=useState(emptyForm),[authentication,setAuthentication]=useState(false);
  const [json,setJson]=useState(''),[filter,setFilter]=useState('all'),[query,setQuery]=useState('');
  const addButton=useRef<HTMLButtonElement>(null);
  const load=async()=>{
    setLoading(true);
    try{const [connections,availableProjects]=await Promise.all([api.getConnectors(),api.getProjects()]);setItems(connections.connectors);setProjects(availableProjects);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  const action=async(fn:()=>Promise<unknown>)=>{
    setBusy(true);setError('');setNotice('');
    try{await fn();await load();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const close=()=>{setEditing(false);setError('');requestAnimationFrame(()=>addButton.current?.focus());};
  const open=(item?:ConnectorItem)=>{
    setExpectedRevision(item?.revision || 0);
    setForm(item?{id:item.id,name:item.name || item.id,transport:item.transport,url:item.url || '',command:item.command || '',args:(item.args || []).join('\n'),scopeId:item.scopeId,token:''}:emptyForm());
    setJson('');setAuthentication(Boolean(item?.hasToken));setEditing(true);setError('');setNotice('');
  };
  const submit=()=>void action(async()=>{
    await api.saveConnector({...form,name:form.name.trim(),url:form.transport==='http'?form.url.trim():undefined,command:form.transport==='stdio'?form.command.trim():undefined,
      args:form.transport==='stdio'?form.args.split('\n').filter(arg=>arg.trim().length>0):[],token:form.transport==='http'&&authentication?form.token || undefined:undefined,expectedRevision});
    close();
  });
  const scopeName=(scope:string)=>scope==='standalone'?(en?'Chats outside projects':'Chat ngoài dự án'):projects.find(p=>`project:${p.id}`===scope)?.name || (en?'Unavailable project':'Dự án không còn khả dụng');
  const labels=en?{add:'Add MCP server',name:'Name',url:'Server address',command:'Program',args:'Arguments',scope:'Use in',token:'Access token',save:'Save connection',cancel:'Cancel',test:'Test',connect:'Connect',disconnect:'Disconnect'}:
    {add:'Thêm máy chủ MCP',name:'Tên kết nối',url:'Địa chỉ dịch vụ',command:'Chương trình',args:'Tham số',scope:'Sử dụng trong',token:'Mã truy cập',save:'Lưu kết nối',cancel:'Hủy',test:'Kiểm tra',connect:'Kết nối',disconnect:'Ngắt kết nối'};

  return <div className="harness-settings connector-settings" onKeyDown={e=>{if(e.key==='Escape'&&editing&&!busy){e.stopPropagation();close();}}}>
    {error&&<div className="connector-feedback connector-error" role="alert"><span>{error}</span>{!editing&&<button className="connector-text-button" disabled={busy||loading} onClick={()=>{setError('');void load();}}>{en?'Try again':'Thử lại'}</button>}</div>}
    {notice&&<p className="connector-feedback" role="status">{notice}</p>}
    {editing?<form className="connector-form" onSubmit={e=>{e.preventDefault();submit();}}>
      <button type="button" className="connector-back" disabled={busy} onClick={close}><ArrowLeft size={15} strokeWidth={1.5}/>{en?'Connections':'Kết nối'}</button>
      <h2>{expectedRevision?(en?'Edit connection':'Sửa kết nối'):labels.add}</h2>
      <fieldset disabled={busy}>
        {!expectedRevision&&<details className="connector-import"><summary>{en?'Import JSON configuration':'Nhập cấu hình JSON'}</summary><p>{en?'Paste one mcpServers entry or a server object. Review before saving.':'Dán một mục mcpServers hoặc đối tượng server. Kiểm tra trước khi lưu.'}</p><label className="connector-field"><span>JSON</span><textarea rows={6} value={json} spellCheck={false} placeholder={'{"mcpServers":{"my-server":{"command":"npx","args":["-y","example-mcp"]}}}'} onChange={e=>setJson(e.target.value)}/></label><button type="button" className="connector-button" onClick={()=>{try{const config=parseMcpConfig(json);setForm({...form,...config,name:config.name||form.name});setAuthentication(Boolean(config.token));setJson('');setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}}>{en?'Apply to form':'Điền vào biểu mẫu'}</button></details>}

        <label className="connector-field"><span>{labels.name}</span><input autoFocus required maxLength={100} value={form.name} placeholder={en?'e.g. My workspace':'Ví dụ: Công cụ công việc'} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <div className="connector-source" role="group" aria-label={en?'Connection source':'Nguồn kết nối'}>
          <button type="button" aria-pressed={form.transport==='http'} onClick={()=>setForm({...form,transport:'http'})}>{en?'Remote · HTTP':'Từ xa · HTTP'}</button>
          <button type="button" aria-pressed={form.transport==='stdio'} onClick={()=>setForm({...form,transport:'stdio'})}>{en?'Local · stdio':'Trên máy · stdio'}</button>
        </div>
        {form.transport==='http'?<>
          <label className="connector-field"><span id="connector-url-label">{labels.url}</span><input aria-labelledby="connector-url-label" type="url" required value={form.url} placeholder="https://example.com/mcp" spellCheck={false} aria-describedby="connector-address-help" onChange={e=>setForm({...form,url:e.target.value})}/><small id="connector-address-help">{en?'Paste the MCP address provided by your service.':'Dán địa chỉ MCP do dịch vụ bạn muốn dùng cung cấp.'}</small></label>
          <details className="connector-auth" open={authentication} onToggle={e=>setAuthentication(e.currentTarget.open)}><summary>{en?'Access token, if required':'Mã truy cập, nếu cần'}</summary>
            <label className="connector-field"><span>{labels.token}</span><input type="password" autoComplete="off" value={form.token} onChange={e=>setForm({...form,token:e.target.value})} placeholder={expectedRevision?(en?'Leave blank to keep the saved token':'Để trống để giữ mã đã lưu'):(en?'Provided by your service':'Do dịch vụ cung cấp')}/></label>
          </details>
        </>:<>
          <label className="connector-field"><span id="connector-command-label">{labels.command}</span><input aria-labelledby="connector-command-label" required value={form.command} spellCheck={false} placeholder="npx" aria-describedby="connector-program-help" onChange={e=>setForm({...form,command:e.target.value})}/><small id="connector-program-help">{en?'Use the program specified in the service setup instructions. It will run on this computer.':'Nhập chương trình theo hướng dẫn của dịch vụ. Chương trình sẽ chạy trên máy này.'}</small></label>
          <label className="connector-field"><span id="connector-args-label">{labels.args}</span><textarea aria-labelledby="connector-args-label" rows={3} value={form.args} spellCheck={false} aria-describedby="connector-args-help" onChange={e=>setForm({...form,args:e.target.value})}/><small id="connector-args-help">{en?'One argument per line, following the service instructions.':'Mỗi dòng một tham số, theo hướng dẫn của dịch vụ.'}</small></label>
        </>}
        <label className="connector-field connector-scope"><span>{labels.scope}</span><select value={form.scopeId} onChange={e=>setForm({...form,scopeId:e.target.value})}>
          <option value="standalone">{en?'Chats outside projects':'Chat ngoài dự án'}</option>
          {projects.map(p=><option key={p.id} value={`project:${p.id}`}>{p.name}</option>)}
          {form.scopeId!=='standalone'&&!projects.some(p=>`project:${p.id}`===form.scopeId)&&<option value={form.scopeId} disabled>{en?'Unavailable project':'Dự án không còn khả dụng'}</option>}
        </select></label>
      </fieldset>
      <div className="connector-form-actions"><button className="connector-button connector-primary" disabled={busy} type="submit">{busy?(en?'Saving…':'Đang lưu…'):labels.save}</button><button className="connector-text-button" type="button" disabled={busy} onClick={close}>{labels.cancel}</button></div>
    </form>:<>
      <div className="connector-heading"><div><h2>MCP</h2><p>{en?'Manage local tools and remote MCP services for ohmyt.':'Quản lý công cụ trên máy và dịch vụ MCP từ xa cho ohmyt.'}</p></div><button className="connector-button" disabled={busy||loading} onClick={()=>void load()} aria-label={en?'Refresh':'Làm mới'}><RefreshCw size={15}/></button><button ref={addButton} className="connector-button" disabled={busy||loading} onClick={()=>open()}><Plus size={15} strokeWidth={1.5}/>{labels.add}</button></div>
      <div className="connector-toolbar"><div className="connector-source" role="group" aria-label={en?'Transport filter':'Lọc kiểu kết nối'}>{[['all',en?'All':'Tất cả'],['stdio','Local · stdio'],['http','Remote · HTTP']].map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label} ({items.filter(i=>key==='all'||i.transport===key).length})</button>)}</div><input aria-label={en?'Search MCP servers':'Tìm máy chủ MCP'} placeholder={en?'Search servers…':'Tìm máy chủ…'} value={query} onChange={e=>setQuery(e.target.value)}/></div>
      {items.length>0&&!items.some(i=>(filter==='all'||i.transport===filter)&&`${i.name} ${i.id}`.toLowerCase().includes(query.toLowerCase()))&&<p className="connector-empty">{en?'No matching servers':'Không có máy chủ phù hợp'}</p>}
      {loading&&!items.length?<p className="connector-empty" role="status">{en?'Loading…':'Đang tải…'}</p>:!items.length&&!error?<div className="connector-empty"><p>{en?'No connections yet':'Chưa có kết nối'}</p><small>{en?'Add one using a server address or the service’s setup instructions.':'Thêm kết nối bằng địa chỉ hoặc hướng dẫn cài đặt từ dịch vụ.'}</small></div>:items.filter(i=>(filter==='all'||i.transport===filter)&&`${i.name} ${i.id}`.toLowerCase().includes(query.toLowerCase())).map(item=><div className="connector-row" key={item.id}>
        <div className="connector-row-info"><strong>{item.transport==='stdio'?<Server size={16}/>:<Globe size={16}/>} {item.name || item.id}</strong><small className="connector-endpoint">{item.transport==='stdio'?[item.command,...(item.args||[])].join(' '):item.url}</small><small>{item.transport==='stdio'?'Local · stdio':'Remote · HTTP'}</small><small>{scopeName(item.scopeId)}</small><span>{item.state==='error'?(en?'Connection lost':'Mất kết nối'):item.state==='connected'?(en?'Connected':'Đã kết nối'):(en?'Not connected':'Chưa kết nối')}</span>{item.tools&&<details className="connector-tools"><summary>{item.tools.length} {en?'tools':'công cụ'}</summary>{item.tools.map(tool=><div key={tool.name}><code>{tool.name}</code><p>{tool.description}</p></div>)}</details>}</div>
        <div className="connector-row-actions">
          {item.state==='disconnected'&&<button className="connector-text-button" disabled={busy} onClick={()=>open(item)}>{en?'Edit':'Sửa'}</button>}
          <button className="connector-text-button" disabled={busy} onClick={()=>void action(async()=>{const result=await api.connectorAction(item.id,'test');if(!result.connected)throw new Error(result.error || (en?'Connection failed. Check the address and access token.':'Không kết nối được. Kiểm tra địa chỉ và mã truy cập.'));setNotice(en?`Connection test passed · ${result.toolCount ?? 0} tools.`:`Kết nối thành công · ${result.toolCount ?? 0} công cụ.`);})}>{labels.test}</button>
          <button className="connector-button" disabled={busy} onClick={()=>void action(()=>api.connectorAction(item.id,item.state==='connected'||item.state==='error'?'disconnect':'connect'))}>{item.state==='connected'||item.state==='error'?labels.disconnect:labels.connect}</button>
        </div>
      </div>)}
    </>}
  </div>;
}
