/** Copy source text without line-number gutters or rendered markup. */
export async function copyToClipboard(text: string): Promise<void> {
  if (window.electronAPI?.writeClipboard) {
    try { await window.electronAPI.writeClipboard(text); return; } catch { /* Try browser mechanisms. */ }
  }
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  } catch { /* Embedded browsers may deny the asynchronous clipboard API. */ }
  const active = document.activeElement as HTMLElement | null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const input = document.createElement('textarea');
  input.value = text;
  input.readOnly = true;
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none;';
  document.body.append(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    if (!document.execCommand('copy')) throw new Error('Clipboard copy failed');
  } finally {
    input.remove();
    active?.focus({ preventScroll: true });
    if (selection) { selection.removeAllRanges(); for (const range of ranges) selection.addRange(range); }
  }
}
