import { servePreviewWorkers } from './previewWorkers.ts';
import { useEffect, useRef, useState } from 'react';

// A fresh opaque frame per source owns the renderer, Workers and object URLs.
// Only document bytes cross this boundary; no grant, path or daemon token does.
export default function FlyfishViewer({ name, data }: { name: string; data: Uint8Array }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = frame.current!;
    const channel = new MessageChannel();
    const bootstrapId = crypto.randomUUID();
    let connected = false;
    const disposeWorkers = servePreviewWorkers(channel.port1, document.baseURI);
    let active = true;
    setState('loading');
    setError('');
    const timer = setTimeout(() => {
      if (active) { setState('error'); setError('Không thể tải trình xem tài liệu. Hãy đóng tab và mở lại.'); }
    }, 60000);
    channel.port1.onmessage = ({ data: message }) => {
      if (!active || !message || !['loading', 'ready', 'error'].includes(message.state)) return;
      setState(message.state);
      if (message.state !== 'loading') clearTimeout(timer);
      setError(message.state === 'error' ? String(message.error || 'Không thể mở tài liệu.').slice(0, 1000) : '');
    };
    const ready = (event: MessageEvent) => {
      if (!active || connected || event.source !== element.contentWindow ||
          event.data?.id !== bootstrapId) return;
      if (event.data.type === 'ohmyt-document-boot-error') {
        clearTimeout(timer);
        setState('error');
        setError('Không thể khởi tạo trình xem tài liệu. Hãy thử lại hoặc khởi động lại app để cập nhật dịch vụ.');
        return;
      }
      if (event.data.type !== 'ohmyt-document-ready') return;
      connected = true;
      const bytes = data.slice().buffer;
      element.contentWindow?.postMessage({ type: 'ohmyt-document-open', name, bytes }, '*', [channel.port2, bytes]);
    };
    // iframe load can fire for about:blank or before asynchronous module startup.
    // Transfer the one-use port only after this exact frame reports readiness.
    window.addEventListener('message', ready);
    const url = new URL('document-viewer.html', document.baseURI);
    url.hash = bootstrapId;
    element.src = url.href;
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('message', ready);
      disposeWorkers();
      channel.port1.close();
      channel.port2.close();
      element.src = 'about:blank';
    };
  }, [name, data, attempt]);
  return <div className="document-flyfish" data-state={state}>
    {state === 'loading' && <p role="status">Đang mở tài liệu…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Thử lại</button></p>}
    <iframe ref={frame} title={`Xem ${name}`} sandbox="allow-scripts" referrerPolicy="no-referrer" className="document-flyfish-frame" />
  </div>;
}
