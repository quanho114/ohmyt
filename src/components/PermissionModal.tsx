import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PermissionRequest } from '../types.ts';
import { X, ChevronRight, FileCode2 } from 'lucide-react';

interface PermissionModalProps {
  request: PermissionRequest | null;
  onRespond: (decision: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY') => void;
}

const actionLabels: Record<string, string> = {
  browser_tabs: 'Xem các tab trình duyệt', browser_read: 'Đọc nội dung trang web',
  browser_observe: 'Quan sát trang web', browser_navigate: 'Mở trang web',
  browser_click: 'Nhấp trên trang web', browser_type: 'Nhập nội dung trên trang web',
  fs_read: 'Đọc tệp', fs_write: 'Tạo hoặc sửa tệp', fs_edit: 'Sửa nội dung tệp', fs_list: 'Xem thư mục',
  shell_exec: 'Chạy lệnh trong dự án', shell_host: 'Chạy lệnh trên máy',
  web_search: 'Tìm kiếm trên web',
  web_fetch: 'Đọc nguồn công khai trên web', source_list: 'Xem nguồn đã đọc', source_read: 'Tra lại nội dung nguồn',
  html_preview: 'Tạo bản xem trước HTML',
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
  const htmlPreview = request.toolName === 'html_preview';
  const htmlContent = typeof request.input.content === 'string' ? request.input.content : '';
  const htmlBytes = htmlPreview ? new TextEncoder().encode(htmlContent).length : 0;
  const htmlSize = htmlBytes < 1024 ? `${htmlBytes} B` : `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(htmlBytes / 1024)} KB`;
  const external = shell && /\b(git push|upload|credential|password)\b/i.test(target);
  const title = actionLabels[request.toolName] || 'Cho phép dùng công cụ?';
  const rememberScope = request.projectId ? 'Ghi nhớ quyền này trong dự án này' : request.scopeId ? 'Ghi nhớ quyền này trong chat này' : 'Ghi nhớ quyền này cho các lần sau';
  const targetLabel = request.toolName === 'browser_tabs' && target === 'tab:shared' ? 'Các tab được chia sẻ với sky' : target;
  // Payloads are untrusted text, not a useful approval headline. Keep the full
  // request available below without allowing generated content to fill the dialog.
  const longTarget = !shell && targetLabel.length > 240;
  const technicalDetails = <>
    {request.description && <p className="approval-description">{request.description}</p>}
    <div><span className="approval-label">Công cụ</span><code>{request.toolName}</code></div>
    <pre className="permission-command" tabIndex={0} aria-label="Tham số công cụ">{JSON.stringify({target:request.target,input:request.input},null,2)}</pre>
  </>;
  return createPortal(<dialog ref={dialogRef} className="permission-dialog approval-checkpoint"
    aria-labelledby="permission-title" aria-describedby="permission-description"
    onCancel={event=>{event.preventDefault();onRespond('DENY');}}>
    <header className="approval-heading">
      <button type="button" className="approval-close" aria-label="Từ chối và đóng" onClick={()=>onRespond('DENY')}><X size={16}/></button>
      <h2 id="permission-title">{title}</h2>
      {!actionLabels[request.toolName] && <code className="approval-tool-name">{request.toolName}</code>}
    </header>
    <div className="permission-body approval-body">
      <div id="permission-description" className="approval-target">
        {htmlPreview ? <>
          <p>sky muốn tạo một tệp HTML để bạn mở bản xem trước hoặc tải xuống trong chat.</p>
          <div className="approval-file">
            <FileCode2 size={22} strokeWidth={1.5} aria-hidden="true" />
            <div><strong>{typeof request.input.name === 'string' && request.input.name ? request.input.name : 'Tệp HTML'}</strong><span>HTML · {htmlSize}</span></div>
          </div>
          <p className="approval-preview-note">Bước này chỉ tạo thẻ xem trước trong chat. Mã HTML chưa được chạy và chưa được ghi thành tệp trên máy.</p>
        </> : shell ? <pre className="permission-command">{targetLabel}</pre> : <>
          <p>{longTarget ? `${targetLabel.slice(0, 240)}…` : targetLabel}</p>
          {longTarget && <p className="approval-truncation">Nội dung đã rút gọn. Mở chi tiết để xem đầy đủ trước khi duyệt.</p>}
        </>}
      </div>
      {external && <p className="approval-impact">Thao tác này có thể gửi thay đổi hoặc thông tin ra ngoài thiết bị.</p>}
      {request.toolName === 'fs_write' && <p className="approval-impact">Tệp đích sẽ được tạo hoặc thay đổi.</p>}
      {request.toolName === 'fs_edit' && <section className="approval-file-edit" aria-label="Thay đổi đề xuất">
        <p className="approval-impact">{request.input.dryRun === true ? 'Chỉ xem trước, chưa ghi tệp.' : 'Chỉ sửa nếu phiên bản tệp vẫn khớp với bản đã đọc.'}</p>
        <p>Đoạn cần thay thế</p><pre className="permission-command">{String(request.input.oldText ?? '').slice(0,4000)}</pre>
        <p>Nội dung thay thế</p><pre className="permission-command">{String(request.input.newText ?? '').slice(0,4000)}</pre>
        {(String(request.input.oldText ?? '').length>4000||String(request.input.newText ?? '').length>4000)&&<p role="note">Nội dung đã rút gọn. Xem tham số đầy đủ trong chi tiết kỹ thuật.</p>}
        {request.input.replaceAll===true&&<p role="note">Thay thế tất cả các đoạn khớp trong tệp.</p>}
      </section>}
      {shell && <p className="approval-impact">Lệnh có thể thay đổi tệp hoặc trạng thái hệ thống.</p>}
      <details className="approval-details" key={request.requestId}>
        <summary><ChevronRight size={14} aria-hidden="true"/>{htmlPreview ? 'Xem mã HTML và chi tiết' : 'Chi tiết kỹ thuật'}</summary>
        {htmlPreview ? <>
          <pre className="permission-command approval-source" tabIndex={0} aria-label="Mã HTML">{htmlContent}</pre>
          <details className="approval-parameters"><summary><ChevronRight size={14} aria-hidden="true"/>Tham số gốc</summary>{technicalDetails}</details>
        </> : technicalDetails}
      </details>
      <label className="approval-remember"><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)}/><span>{rememberScope}</span></label>
    </div>
    <footer className="permission-footer approval-actions">
      <button ref={denyRef} type="button" autoFocus onClick={()=>onRespond('DENY')}>Từ chối</button>
      <button type="button" className="approval-allow" onClick={()=>onRespond(remember?'ALLOW_ALWAYS':'ALLOW_ONCE')}>{remember?'Cho phép và ghi nhớ':'Cho phép một lần'}</button>
    </footer>
  </dialog>,document.body);
};
