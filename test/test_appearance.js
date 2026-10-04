import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const vite = await createServer({ server: { middlewareMode: true } });
try {
  const { normalizeAppearance, readAppearance, resolveLocale } = await vite.ssrLoadModule('/src/appearance.ts');
  assert.equal(normalizeAppearance({ chatBackground: 'bogus' }).chatBackground, 'none');
  assert.equal(normalizeAppearance({}).mascot, 'blue-puff');
  assert.equal(normalizeAppearance({ mascot: 'unknown' }).mascot, 'blue-puff');
  const { mascots } = await vite.ssrLoadModule('/src/mascots.ts');
  assert.equal(mascots.length, 13);
  for (const mascot of mascots) {
    const restored = readAppearance({ getItem: key => key === 'ohmyt_appearance' ? JSON.stringify({ mascot: mascot.id }) : null });
    assert.equal(restored.mascot, mascot.id, 'Selected mascot survives a settings reload');
  }

  assert.equal(normalizeAppearance({ chatBackgroundOpacity: 150 }).chatBackgroundOpacity, 100);
  assert.equal(normalizeAppearance({ chatBackgroundOpacity: -10 }).chatBackgroundOpacity, 0);
  assert.equal(normalizeAppearance({ chatBackgroundOpacity: NaN }).chatBackgroundOpacity, 25);
  assert.equal(normalizeAppearance({ chatBackgroundImage: 'https://example.com/image.jpg' }).chatBackgroundImage, '');
  const imageData = 'data:image/jpeg;base64,YWJj';
  assert.equal(normalizeAppearance({ chatBackgroundImage: imageData }).chatBackgroundImage, imageData);
  const { chatBackgrounds, chatBackgroundPaint } = await vite.ssrLoadModule('/src/chatBackgrounds.ts');
  assert.equal(chatBackgrounds.length, 28);
  for (const background of chatBackgrounds) {
    const selected = normalizeAppearance({ chatBackground: background.id });
    assert.equal(selected.chatBackground, background.id);
    assert.equal(chatBackgroundPaint(selected), background.paint);
  }
  assert.equal(chatBackgroundPaint(normalizeAppearance({})), undefined);
  assert.equal(chatBackgroundPaint(normalizeAppearance({ chatBackground: 'custom', chatBackgroundImage: imageData })), `url("${imageData}")`);
  const { AppearanceSettings } = await vite.ssrLoadModule('/src/components/AppearanceSettings.tsx');
  const settingsMarkup = renderToStaticMarkup(React.createElement(AppearanceSettings, {
    appearance: normalizeAppearance({ chatBackground: 'ocean' }), activeTheme: 'light', locale: 'vi', saveState: 'saved', onChangeAppearance: () => {}
  }));
  assert.ok(settingsMarkup.includes('Nhân vật Trang chủ'));
  assert.equal((settingsMarkup.match(/name="homepage-mascot"/g) || []).length, 13);
  assert.ok(settingsMarkup.includes('Nền khung chat'));
  assert.ok(settingsMarkup.includes('Tải ảnh của bạn lên'));
  assert.ok(settingsMarkup.includes('Độ đậm của nền'));
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
  for (const language of ['constructor', '__proto__']) {
    const unsupported = renderToStaticMarkup(React.createElement(ContentBlock, {
      language, code: '  <script>unsafe</script>\n', appearance: normalizeAppearance({}), activeTheme: 'light'
    }));
    assert.ok(unsupported.includes('  &lt;script&gt;unsafe&lt;/script&gt;\n'));
    assert.ok(!unsupported.includes('<script>'));
  }
  const source = '  const value: string = "<script>alert(1)</script>";\n\n';
  const highlighted = renderToStaticMarkup(React.createElement(ContentBlock, {
    language: 'typescript', code: source, appearance: normalizeAppearance({}), activeTheme: 'light'
  }));
  const highlightedCode = highlighted.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)[1];
  assert.ok(highlightedCode.includes('<span'), 'Supported syntax should have token markup');
  assert.ok(!highlighted.includes('<script>'));
  assert.equal(highlightedCode.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&'), source);
  console.log('Appearance normalization, legacy theme, locale and unsafe code rendering passed.');
} finally {
  await vite.close();
}
