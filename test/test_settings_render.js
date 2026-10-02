import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Catch settings taking chat space on startup, or losing sections during the move.
// Server rendering only needs the initial theme; effects are checked in the browser.
globalThis.document = { documentElement: { getAttribute: () => 'light' } };
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { App } = await server.ssrLoadModule('/src/App.tsx');
  const initial = renderToStaticMarkup(React.createElement(App));
  assert.ok(!initial.includes('Chưa có hoạt động nào.'), 'Settings must be closed on startup');
  assert.ok(initial.includes('Mở cài đặt'), 'The sidebar must provide access to settings');

  const { SettingsPage } = await server.ssrLoadModule('/src/components/SettingsPage.tsx');
  const { defaultAppearance } = await server.ssrLoadModule('/src/appearance.ts');
  const props = {
    status: null, memories: [], skills: [], timelineEvents: [], providers: [],
    isStreaming: false, appearance: defaultAppearance, onChangeAppearance() {},
    activeTheme: 'light', locale: 'vi', saveState: 'saved', onTakeControl() {},
    onDeleteMemory() {}, onRefreshMemories() {}, onClose() {}, onRefreshProviders() {}
  };
  for (const [activeTab, expected] of [
    ['settings', 'Theo hệ thống'], ['providers', '+ Add Provider'],
    ['memory', 'Tìm kiếm bộ nhớ'], ['skills', 'Kỹ năng Agent'], ['timeline', 'Chưa có hoạt động nào.']
  ]) {
    const markup = renderToStaticMarkup(React.createElement(SettingsPage, { ...props, activeTab, onSelectTab() {} }));
    assert.ok(markup.includes('settings-page'), 'Settings must render as a page');
    assert.ok(markup.includes(expected), `Missing content for ${activeTab}`);
    if (activeTab === 'settings') assert.ok(!markup.includes('+ Add Provider'), 'Providers need their own section');
  }
  console.log('Settings: closed startup, sidebar access and all five sections passed.');
} finally {
  await server.close();
  delete globalThis.document;
}
