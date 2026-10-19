import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const vite=await createServer({server:{middlewareMode:true}});
try {
 const {ChatMessage}=await vite.ssrLoadModule('/src/components/ChatMessage.tsx');
 const {defaultAppearance}=await vite.ssrLoadModule('/src/appearance.ts');
 const render=(content,isStreaming=false)=>renderToStaticMarkup(React.createElement(ChatMessage,{
  message:{id:'table-test',sender:'agent',content,created_at:0},isStreaming,
  appearance:{...defaultAppearance,responseAnimation:'off',transition:'none'},activeTheme:'light'
 }));
 const sample='Trước bảng\n\n| Hạng mục | Tình trạng kiểm tra | Chi tiết xử lý |\n| :--- | :---: | ---: |\n| **Vật lý** | Đạt | `gravity = 0.36` |\n| Âm thanh | Đạt | [Nguồn](https://example.com) |\n\nSau bảng';
 for(const streaming of [false,true]){
  const html=render(sample,streaming);
  assert.equal((html.match(/<table /g)||[]).length,1);
  assert.equal((html.match(/<th /g)||[]).length,3);
  assert.equal((html.match(/<td(?: |>)/g)||[]).length,6);
  assert(html.includes('text-align:center'));
  assert(html.includes('text-align:right'));
  assert(html.includes('>Vật lý</strong>'));
  assert(html.includes('gravity = 0.36</code>'));
  assert(html.includes('href="https://example.com/"'));
  assert(html.includes('Trước bảng') && html.includes('Sau bảng'));
 }
 const escaped=render('A | B\n--- | ---\nx\\|y | z\nshort |\nextra | cell | ignored');
 assert(escaped.includes('>x|y</td>'));
 assert.equal((escaped.match(/<td(?: |>)/g)||[]).length,6);
 assert(!escaped.includes('ignored'));
 assert(!render('| A | B |\n| --- |\n| x | y |').includes('<table '));
 assert(!render('Text | pipe\nnot a delimiter').includes('<table '));
 assert(!render('```text\n| A | B |\n| --- | --- |\n| x | y |\n```').includes('<table '));
 assert(!render('| A | B |\n| --- | --- |\n| <script>alert(1)</script> | safe |').includes('<script>'));
 const partial='| A | B |\n| --- |';
 assert(!render(partial,true).includes('<table '));
 assert(render(partial+' --- |\n| x | y |',true).includes('<table '));
 console.log('PASS Markdown tables: screenshot format, alignment, inline formatting, escaped pipes, streaming, code exclusions and safe text');
} finally {await vite.close();}
