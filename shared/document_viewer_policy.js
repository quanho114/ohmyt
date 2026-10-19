// The opaque preview frame may load public runtime assets, never daemon APIs.
export function isDocumentViewerAsset(pathname) {
  return /^\/(?:assets|file-viewer)\/[^\\]*$/.test(pathname)
    && !pathname.split('/').some(part => part === '..' || /%2e|%2f|%5c/i.test(part));
}

export function documentViewerCsp(origin, development = false) {
  const scripts = [`${origin}/assets/`, `${origin}/file-viewer/`, "blob:", "'wasm-unsafe-eval'"];
  if (development) scripts.push(`${origin}/src/`, `${origin}/node_modules/`, `${origin}/@vite/`, `${origin}/@react-refresh`, "'unsafe-inline'");
  return [
    "default-src 'none'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'unsafe-inline' " + origin,
    `connect-src ${origin}/file-viewer/ ${origin}/assets/ blob:`,
    "img-src data: blob:",
    `font-src ${origin}/file-viewer/ ${origin}/assets/ data: blob:`,
    "worker-src blob:",
    "media-src data: blob:",
    "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'",
  ].join('; ');
}
