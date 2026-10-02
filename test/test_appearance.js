import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const vite = await createServer({ server: { middlewareMode: true } });
try {
  const { normalizeAppearance, readAppearance, resolveLocale } = await vite.ssrLoadModule('/src/appearance.ts');
  const a = normalizeAppearance({ fontSize: 99, accent: 'purple', autoScroll: false, neutral: 'bogus' }, 'dark');
  assert.equal(a.fontSize, 20);
  assert.equal(a.accent, 'purple');
  assert.equal(a.autoScroll, false);
  assert.equal(a.neutral, 'default');
  assert.equal(a.themeMode, 'dark');
  assert.equal(normalizeAppearance({ fontSize: -8 }).fontSize, 12);
  assert.equal(normalizeAppearance({ fontSize: NaN }).fontSize, 14);
  assert.equal(normalizeAppearance({ fontSize: 15.7 }).fontSize, 16);
  assert.equal(readAppearance({ getItem: key => key === 'ohmyt_appearance' ? '{broken' : key === 'ohmyt_theme' ? 'light' : null }).themeMode, 'light');
  assert.equal(resolveLocale('system', 'vi-VN'), 'vi');
  assert.equal(resolveLocale('system', 'fr-FR'), 'en');
  assert.equal(resolveLocale('vi', 'en-US'), 'vi');
  const { ContentBlock } = await vite.ssrLoadModule('/src/components/ContentBlock.tsx');
  const markup = renderToStaticMarkup(React.createElement(ContentBlock, {
    language: 'unknown_language', code: '  <script>alert(1)</script>\n\n',
    appearance: normalizeAppearance({}), activeTheme: 'light'
  }));
  assert.ok(!markup.includes('<script>'));
  assert.ok(markup.includes('  &lt;script&gt;alert(1)&lt;/script&gt;\n\n'));
  console.log('Appearance normalization, legacy theme and locale boundaries passed.');
} finally {
  await vite.close();
}
