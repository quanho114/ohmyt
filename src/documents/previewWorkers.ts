function buffersIn(value: unknown): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const seen = new Set<object>();
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (item instanceof ArrayBuffer) buffers.add(item);
    else if (ArrayBuffer.isView(item)) {
      if (item.buffer instanceof ArrayBuffer) buffers.add(item.buffer);
    } else if (item && typeof item === 'object' && !seen.has(item)) {
      seen.add(item);
      for (const value of Object.values(item)) pending.push(value);
    }
  }
  return [...buffers];
}

// The opaque renderer can request only packaged parsing Workers. No arbitrary
// script, blob URL, credentials or filesystem access is accepted across the port.
export function servePreviewWorkers(port: MessagePort, base: string) {
  const workers = new Map<number, Worker>();
  const origin = new URL(base).origin;
  port.addEventListener('message', ({ data: message }) => {
    if (!message || !Number.isSafeInteger(message.id)) return;
    const id = message.id;
    const fail = (error: string) => port.postMessage({ type: 'worker-error', id, error });
    if (message.type === 'worker-create') {
      try {
        const url = new URL(message.url);
        if (workers.has(id) || workers.size >= 8 || url.origin !== origin || url.username || url.password ||
            !/^\/file-viewer\/vendor\/(docx\/docx\.worker\.js|xlsx\/sheet\.worker\.js|pptx\/pptx\.worker\.js|pdf\/pdf\.worker\.mjs)$/.test(url.pathname) ||
            url.pathname.split('/').includes('..')) throw new Error('Worker URL is not allowed');
        const worker = new Worker(url, { type: message.options?.type === 'module' ? 'module' : 'classic' });
        workers.set(id, worker);
        worker.onmessage = event => port.postMessage({ type: 'worker-message', id, data: event.data }, buffersIn(event.data));
        worker.onerror = event => fail(event.message || 'Không thể chạy Worker tài liệu.');
        worker.onmessageerror = () => fail('Không thể đọc kết quả Worker tài liệu.');
      } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
    } else if (message.type === 'worker-message') {
      try { workers.get(id)?.postMessage(message.data, buffersIn(message.data)); }
      catch (error) { fail(String(error)); }
    } else if (message.type === 'worker-terminate') {
      workers.get(id)?.terminate(); workers.delete(id);
    }
  });
  return () => { for (const worker of workers.values()) worker.terminate(); workers.clear(); };
}
