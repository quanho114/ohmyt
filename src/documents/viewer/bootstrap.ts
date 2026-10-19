// Report module startup failures through the same source/nonce-bound handshake.
import('./main.tsx').catch(() => {
  parent.postMessage({ type: 'ohmyt-document-boot-error', id: location.hash.slice(1) }, '*');
});
