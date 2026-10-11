export function browserBounds(rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>, fixedWidth?: number) {
  const x = Math.round(rect.left);
  const y = Math.round(rect.top);
  // Round shared edges, not sizes: x + width must equal the fixed right edge
  // while anchored. A sliding surface supplies its fixed width instead,
  // avoiding one-pixel width changes as both edges move together.
  return {
    x,
    y,
    width: Math.max(0, fixedWidth ?? Math.round(rect.right) - x),
    height: Math.max(0, Math.round(rect.bottom) - y)
  };
}
