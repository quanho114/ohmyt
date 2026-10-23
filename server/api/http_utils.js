import fs from 'node:fs';
import path from 'node:path';
import { isDocumentViewerAsset, documentViewerCsp } from '../../shared/document_viewer_policy.js';

export function sendJson(res, statusCode, data) {
  const jsonStr = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(jsonStr)
  });
  res.end(jsonStr);
}

export function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 24 * 1024 * 1024) {
        tooLarge = true;
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(new Error('Payload quá lớn'));
        return;
      }
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

export function parseBinary(req, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) reject(new Error('Payload quá lớn'));
      else resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

export function serveStaticAsset(res, { method, pathname, requestHost, publicPreviewAsset }) {
  if ((method !== 'GET' && method !== 'HEAD') || pathname.startsWith('/api')) {
    return false;
  }
  const distDir = path.resolve(process.cwd(), 'dist');
  if (!fs.existsSync(distDir)) {
    return false;
  }
  let filePath = path.join(distDir, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }
  if (publicPreviewAsset && (!fs.existsSync(filePath) || path.basename(filePath) === 'index.html')) {
    sendJson(res, 404, { error: 'Preview asset not found' });
    return true;
  }
  if (!fs.existsSync(filePath)) {
    return false;
  }
  if (pathname === '/document-viewer.html' || isDocumentViewerAsset(pathname)) {
    res.setHeader('Content-Security-Policy', documentViewerCsp(requestHost.origin));
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_BY_EXT[ext] || 'text/plain';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000'
  });
  if (method === 'HEAD') {
    res.end();
  } else {
    res.end(content);
  }
  return true;
}
