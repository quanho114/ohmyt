import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const vite=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const {ChatMessage}=await vite.ssrLoadModule('/src/components/ChatMessage.tsx');
 const {defaultAppearance}=await vite.ssrLoadModule('/src/appearance.ts');
 const render=(answerComplete,extra={})=>renderToStaticMarkup(React.createElement(ChatMessage,{
  message:{id:'streaming-active',sender:'agent',content:'Câu trả lời đã đủ.',created_at:0},
  isStreaming:true,answerComplete,appearance:{...defaultAppearance,responseAnimation:'off'},activeTheme:'light',...extra,
 }));
 assert(render(false).includes('response-cursor'),'Cursor is visible while the answer streams');
 assert(!render(true).includes('response-cursor'),'Cursor stops when the answer completes, even while the run is draining title generation');
 assert(render(true).includes('Câu trả lời đã đủ.'));
 const running=render(false,{activity:{startedAt:Date.now(),phase:'answer',reasoning:'',tools:[{id:'preview',name:'html_preview',input:{name:'game.html'},status:'running'}]}});
 assert(!running.includes('response-cursor'),'A running tool takes precedence over a stale answer phase');
 assert(running.includes('Create HTML preview'),'The actual tool remains visible after commentary');
 const reasoning=render(false,{activity:{startedAt:Date.now(),phase:'reasoning',reasoning:'Checking the result.',tools:[]}});
 assert(!reasoning.includes('response-cursor'),'Reasoning after commentary is not answer typing');
 console.log('PASS answer cursor: stop on answer completion while retaining streamed content');
}finally{await vite.close();}
