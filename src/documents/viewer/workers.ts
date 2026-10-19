// Workers run outside the opaque iframe, with an asset-only URL allowlist and
// their own CSP. The document gets a Worker-shaped message proxy, never a token.
export function installPreviewWorkers(port: MessagePort) {
  const workers = new Map<number, PreviewWorker>();
  let nextId = 0;
  class PreviewWorker extends EventTarget {
    readonly id = ++nextId;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;
    constructor(source: string | URL, options?: WorkerOptions) {
      super();
      const url = new URL(String(source), document.baseURI);
      if (url.origin !== new URL(document.baseURI).origin || !/^\/file-viewer\//.test(url.pathname)) {
        throw new Error('Worker nằm ngoài tài nguyên trình xem.');
      }
      workers.set(this.id, this);
      port.postMessage({ type: 'worker-create', id: this.id, url: url.href, options });
    }
    postMessage(data: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
      const transfers = Array.isArray(transfer) ? transfer : transfer?.transfer || [];
      port.postMessage({ type: 'worker-message', id: this.id, data }, transfers);
    }
    terminate() {
      workers.delete(this.id);
      port.postMessage({ type: 'worker-terminate', id: this.id });
    }
  }
  // Worker DOM typings include native members that renderer code does not use.
  window.Worker = PreviewWorker as unknown as typeof Worker;
  port.addEventListener('message', ({ data: message }) => {
    const worker = workers.get(message.id);
    if (!worker) return;
    if (message.type === 'worker-message') {
      const event = new MessageEvent('message', { data: message.data });
      worker.dispatchEvent(event); worker.onmessage?.(event);
    } else if (message.type === 'worker-error') {
      const event = new ErrorEvent('error', { message: message.error });
      worker.dispatchEvent(event); worker.onerror?.(event);
    }
  });
  port.start();
  window.addEventListener('pagehide', () => {
    for (const worker of workers.values()) worker.terminate();
    workers.clear();
  }, { once: true });
}
