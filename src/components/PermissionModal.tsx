import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PermissionRequest } from '../types.ts';
import { X, ChevronRight } from 'lucide-react';

interface PermissionModalProps {
  request: PermissionRequest | null;
  onRespond: (decision: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY') => void;
}

const actionLabels: Record<string, string> = {
  browser_tabs: 'Xem các tab trình duyệt', browser_read: 'Đọc nội dung trang web',
  browser_observe: 'Quan sát trang web', browser_navigate: 'Mở trang web',
  browser_click: 'Nhấp trên trang web', browser_type: 'Nhập nội dung trên trang web',
  fs_read: 'Đọc tệp', fs_write: 'Tạo hoặc sửa tệp', fs_list: 'Xem thư mục',
  shell_exec: 'Chạy lệnh trong dự án', shell_host: 'Chạy lệnh trên máy',
  web_search: 'Tìm kiếm trên web',
  web_fetch: 'Đọc nguồn công khai trên web', source_list: 'Xem nguồn đã đọc', source_read: 'Tra lại nội dung nguồn',
};

export const PermissionModal: React.FC<PermissionModalProps> = ({ request, onRespond }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const denyRef = useRef<HTMLButtonElement>(null);
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    setRemember(false);
    if (request && dialogRef.current) {
      if (!dialogRef.current.open) dialogRef.current.showModal();
      denyRef.current?.focus({preventScroll:true});
    }
  }, [request?.requestId]);
  if (!request) return null;
  const target = request.target || JSON.stringify(request.input);
  const shell = request.toolName === 'shell_exec' || request.toolName === 'shell_host';
  const external = /\b(git push|upload|credential|password)\b/i.test(target);
  const title = actionLabels[request.toolName] || 'Thực hiện thao tác công cụ';
  const rememberScope = request.projectId ? 'Ghi nhớ quyền này trong dự án này' : request.scopeId ? 'Ghi nhớ quyền này trong chat này' : 'Ghi nhớ quyền này cho các lần sau';
  const targetLabel = request.toolName === 'browser_tabs' && target === 'tab:shared' ? 'Các tab được chia sẻ với ohmyt' : target;
  return createPortal(<dialog ref={dialogRef} className="permission-dialog approval-checkpoint"
    aria-labelledby="permission-title" aria-describedby="permission-description"
    onCancel={event=>{event.preventDefault();onRespond('DENY');}}>
    <header className="approval-heading">
      <button type="button" className="approval-close" aria-label="Từ chối và đóng" onClick={()=>onRespond('DENY')}><X size={16}/></button>
      <h2 id="permission-title">{title}</h2>
    </header>
    <div className="permission-body approval-body">
      <div id="permission-description" className="approval-target">
        {shell ? <pre className="permission-command">{targetLabel}</pre> : <p>{targetLabel}</p>}
      </div>
      {external && <p className="approval-impact">Thao tác này có thể gửi thay đổi hoặc thông tin ra ngoài thiết bị.</p>}
      {request.toolName === 'fs_write' && <p className="approval-impact">Tệp đích sẽ được tạo hoặc thay đổi.</p>}
      {shell && <p className="approval-impact">Lệnh có thể thay đổi tệp hoặc trạng thái hệ thống.</p>}
      <details className="approval-details" key={request.requestId}>
        <summary><ChevronRight size={13}/>Chi tiết kỹ thuật</summary>
        {request.description && <p className="approval-description">{request.description}</p>}
        <div><span className="approval-label">Công cụ</span><code>{request.toolName}</code></div>
        <pre className="permission-command">{JSON.stringify({target:request.target,input:request.input},null,2)}</pre>
      </details>
      <label className="approval-remember"><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)}/><span>{rememberScope}</span></label>
    </div>
    <footer className="permission-footer approval-actions">
      <button ref={denyRef} type="button" autoFocus onClick={()=>onRespond('DENY')}>Từ chối</button>
      <button type="button" className="approval-allow" onClick={()=>onRespond(remember?'ALLOW_ALWAYS':'ALLOW_ONCE')}>{remember?'Cho phép và ghi nhớ':'Cho phép một lần'}</button>
    </footer>
  </dialog>,document.body);
};
