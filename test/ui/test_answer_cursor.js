import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const vite=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const {ChatMessage}=await vite.ssrLoadModule('/src/components/ChatMessage.tsx');
 const {defaultAppearance}=await vite.ssrLoadModule('/src/appearance.ts');
 const render=answerComplete=>renderToStaticMarkup(React.createElement(ChatMessage,{
  message:{id:'streaming-active',sender:'agent',content:'Câu trả lời đã đủ.',created_at:0},
  isStreaming:true,answerComplete,appearance:{...defaultAppearance,responseAnimation:'off'},activeTheme:'light',
 }));
 assert(render(false).includes('response-cursor'),'Cursor is visible while the answer streams');
 assert(!render(true).includes('response-cursor'),'Cursor stops when the answer completes, even while the run is draining title generation');
 assert(render(true).includes('Câu trả lời đã đủ.'));
 console.log('PASS answer cursor: stop on answer completion while retaining streamed content');
}finally{await vite.close();}
