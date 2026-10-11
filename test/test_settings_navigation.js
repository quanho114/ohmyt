import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const vite=await createServer({server:{middlewareMode:true}});
try {
 const {SettingsPage}=await vite.ssrLoadModule('/src/components/SettingsPage.tsx');
 const {defaultAppearance}=await vite.ssrLoadModule('/src/appearance.ts');
 const noop=()=>{};
 const html=renderToStaticMarkup(React.createElement(SettingsPage,{
  memories:[],skills:[],activeTab:'memory',onSelectTab:noop,isStreaming:false,
  appearance:defaultAppearance,onChangeAppearance:noop,activeTheme:'light',locale:'vi',saveState:'saved',
  onTakeControl:noop,onDeleteMemory:noop,onRefreshMemories:noop,onClose:noop,providers:[],onRefreshProviders:noop
 }));
 assert.equal((html.match(/class="settings-nav-item"/g)||[]).length,6);
 assert(html.includes('Thống kê'));
 assert(!html.includes('Timeline'));
 const groups=html.split('class="settings-page-nav-group"');
 assert(groups.find(group=>group.includes('<h2>Cá nhân</h2>'))?.includes('Thống kê'));
 assert(!groups.find(group=>group.includes('<h2>Mô hình &amp; Engine</h2>'))?.includes('Thống kê'));
 console.log('PASS settings render: six valid menu items, Statistics in Personal, no Timeline');
} finally {await vite.close();}
