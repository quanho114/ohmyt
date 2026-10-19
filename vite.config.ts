import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileViewerRenderers } from '@file-viewer/vite-plugin';
import { documentViewerCsp, isDocumentViewerAsset } from './shared/document_viewer_policy.js';

export default defineConfig({
  plugins: [react(), tailwindcss(), fileViewerRenderers({
    formats: ['docx', 'xlsx', 'xls', 'pptx', 'pdf', 'md'],
    inject: false,
    scan: false,
    copyAssets: { baseDir: 'file-viewer' },
    // Let the bundler share individual dependencies; renderer groups can pull
    // preview code into chat's eager chunks through shared DOM/Markdown helpers.
    chunkStrategy: 'none',
    stabilizeInteropChunks: false,
  }), {
    name: 'ohmyt-document-preview-policy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/document-viewer.html' || isDocumentViewerAsset(req.url?.split('?')[0] || '')) {
          res.setHeader('Content-Security-Policy', documentViewerCsp(`http://${req.headers.host}`, true));
        }
        next();
      });
    },
  }],
  optimizeDeps: {
    // Prebundle the snapshot parser before opening a workbook in development.
    // Prebundle lazy diagram modules together, so switching diagram types cannot
    // trigger a second optimization pass and invalidate the existing module URLs.
    include: ['xlsx', 'mermaid', 'mermaid/dist/chunks/mermaid.core/*.mjs'],
  },
  server: {
    port: 5173,
    cors: { origin: [/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'null'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3188',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    rolldownOptions: { input: { app: 'index.html', documentViewer: 'document-viewer.html' } },
    emptyOutDir: true
  }
});
