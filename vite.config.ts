import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // Prebundle lazy diagram modules together, so switching diagram types cannot
    // trigger a second optimization pass and invalidate the existing module URLs.
    include: ['mermaid', 'mermaid/dist/chunks/mermaid.core/*.mjs'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3188',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
