import assert from 'node:assert/strict';
import { servePreviewWorkers } from '../../src/documents/previewWorkers.ts';
import { documentViewerCsp, isDocumentViewerAsset } from '../../shared/document_viewer_policy.js';

const made: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror = null;
  onmessageerror = null;
  terminated = false;
  messages: unknown[] = [];
  url: URL; options: unknown;
  constructor(url: URL, options: unknown) { this.url = url; this.options = options; made.push(this); }
  postMessage(data: unknown) { this.messages.push(data); }
  terminate() { this.terminated = true; }
}
// Exercise the actual host boundary, including malicious frame requests.
Object.assign(globalThis, { Worker: FakeWorker });
const { port1, port2 } = new MessageChannel();
const dispose = servePreviewWorkers(port1, 'http://127.0.0.1:3188/');
port1.start(); port2.start();
const errors: { type: string; id: number; error: string }[] = [];
port2.onmessage = event => errors.push(event.data);
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
try {
  port2.postMessage({ type: 'worker-create', id: 1, url: 'http://127.0.0.1:3188/file-viewer/vendor/xlsx/sheet.worker.js', options: { type: 'module' } });
  await tick();
  assert.equal(made.length, 1);
  assert.deepEqual(made[0].options, { type: 'module' });
  for (const [index, url] of [
    'https://example.com/file-viewer/vendor/xlsx/sheet.worker.js',
    'http://127.0.0.1:3188/api/health',
    'blob:http://127.0.0.1:3188/unknown',
    'http://127.0.0.1:3188/assets/app.js',
    'http://127.0.0.1:3188/file-viewer/vendor/docx/jszip.min.js',
    'http://127.0.0.1:3188/file-viewer/vendor/xlsx/%2e%2e/secret.js',
  ].entries()) port2.postMessage({ type: 'worker-create', id: index + 2, url });
  await tick();
  assert.equal(made.length, 1);
  assert.equal(errors.length, 6);
  assert(errors.every(error => error.type === 'worker-error'));
  port2.postMessage({ type: 'worker-message', id: 1, data: { command: 'parse' } });
  await tick();
  assert.deepEqual(made[0].messages, [{ command: 'parse' }]);
  made[0].onmessage!({ data: { rows: 10 } });
  await tick();
  assert.deepEqual(errors.at(-1), { type: 'worker-message', id: 1, data: { rows: 10 } });
  port2.postMessage({ type: 'worker-terminate', id: 1 });
  await tick();
  assert(made[0].terminated);
  port2.postMessage({ type: 'worker-create', id: 20, url: 'http://127.0.0.1:3188/file-viewer/vendor/pdf/pdf.worker.mjs' });
  await tick();
  dispose();
  assert(made[1].terminated, 'closing preview terminates dependent Workers');
  assert(isDocumentViewerAsset('/file-viewer/vendor/pdf/pdf.worker.mjs'));
  assert(!isDocumentViewerAsset('/api/health'));
  assert(!isDocumentViewerAsset('/assets/%2e%2e/private'));
  const csp = documentViewerCsp('http://127.0.0.1:3188');
  assert(csp.includes("default-src 'none'"));
  assert(csp.includes("frame-src 'none'"));
  assert(!csp.includes("connect-src 'self'"));
  console.log('Document preview: Worker allowlist, messages, cleanup and opaque-frame policy passed');
} finally { dispose(); port1.close(); port2.close(); }
