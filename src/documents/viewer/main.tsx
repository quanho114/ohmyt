import { normalizeFileViewerErrorMessage, type FileViewerRendererPlugin } from '@file-viewer/core';
import { createRoot } from 'react-dom/client';
import { FileViewer, type ViewerOptions } from '@file-viewer/react';
import { setDefaultFileViewerAssetBaseUrl } from '@file-viewer/core/assets';
import { installPreviewWorkers } from './workers.ts';
import './viewer.css';

setDefaultFileViewerAssetBaseUrl(new URL('file-viewer/', document.baseURI).href);
const root = createRoot(document.getElementById('root')!);
let opened = false;
// Links and forms in document content never navigate the preview or open windows.
document.addEventListener('click', event => {
  if (event.composedPath().some(node => node instanceof HTMLAnchorElement)) event.preventDefault();
}, true);
document.addEventListener('submit', event => event.preventDefault(), true);

async function rendererFor(name: string) {
  switch (name.split('.').pop()?.toLowerCase()) {
    case 'docx': return (await import('@file-viewer/renderer-word')).wordRenderer;
    case 'xlsx': case 'xls': return (await import('@file-viewer/renderer-spreadsheet')).spreadsheetRenderer;
    case 'pptx': return (await import('@file-viewer/renderer-presentation')).presentationRenderer;
    case 'pdf': return (await import('@file-viewer/renderer-pdf')).pdfRenderer;
    case 'md': return (await import('@file-viewer/renderer-text')).textRenderer;
    default: throw new Error('Định dạng chưa được hỗ trợ.');
  }
}
window.addEventListener('message', async event => {
  if (opened || event.source !== parent || event.data?.type !== 'ohmyt-document-open' ||
      !(event.data.bytes instanceof ArrayBuffer) || typeof event.data.name !== 'string' || !event.ports[0]) return;
  opened = true;
  const port = event.ports[0];
  installPreviewWorkers(port);
  const send = (state: string, error?: string) => port.postMessage({ state, error });
  try {
    const renderer = await rendererFor(event.data.name);
    // Upstream renderer handlers require a DIV while the public registry accepts
    // any HTMLElement. Narrow at this boundary instead of weakening type checks.
    const plugin: FileViewerRendererPlugin = {
      id: renderer.id, label: renderer.label, definitions: renderer.definitions, assets: renderer.assets,
      handlers: renderer.handlers?.map(({ rendererId, handler }) => ({
        rendererId,
        handler: (buffer, target, type, context) => {
          if (!(target instanceof HTMLDivElement)) throw new Error('Invalid preview container');
          return handler(buffer, target, type, context);
        },
      })),
    };
    const options: ViewerOptions = {
      locale: 'en-US', theme: 'light', styleIsolation: 'scoped',
      rendererMode: 'replace', autoRenderers: false, renderers: [plugin],
      fit: { mode: /\.(xlsx?|md)$/i.test(event.data.name) ? 'scale-down' : 'width', resize: 'until-interaction', maxScale: 1 },
      ui: { density: 'compact' },
      toolbar: { position: 'top', search: true, zoom: !event.data.name.toLowerCase().endsWith('.pdf'), theme: false, download: false, print: false, exportHtml: false },
      docx: { worker: true, externalLinkPolicy: 'block', externalResourcePolicy: 'block', renderAltChunks: false },
      spreadsheet: { worker: true, resizableColumns: true, resizableRows: true, fillViewport: true },
      pdf: { streaming: false },
    };
    root.render(<FileViewer filename={event.data.name} buffer={event.data.bytes} options={options}
      style={{ width: '100%', height: '100%' }}
      onStateChange={state => {
        if (state.error) { send('error', normalizeFileViewerErrorMessage(state.error, { locale: 'en-US' })); }
        else if (state.ready) send('ready');
        else if (state.loading) send('loading');
      }} />);
  } catch (error) {
    send('error', error instanceof Error ? error.message : String(error));
  }
  window.addEventListener('pagehide', () => { root.unmount(); port.close(); }, { once: true });
});

// Listener registration must precede the host transferring its one-use port.
parent.postMessage({ type: 'ohmyt-document-ready', id: location.hash.slice(1) }, '*');
