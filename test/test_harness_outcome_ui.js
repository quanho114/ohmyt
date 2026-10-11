import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const vite=await createServer({server:{middlewareMode:true}});
try{
 const {ResponseActivity}=await vite.ssrLoadModule('/src/components/ResponseActivity.tsx');
 const labels={vi:{partial:'Chưa hoàn thành toàn bộ',blocked:'Chưa hoàn thành · gặp trở ngại',failed:'Chưa hoàn thành',unknown:'Kết quả chưa được xác minh',verified:'Đã xác minh kết quả'},en:{partial:'Partially completed',blocked:'Not completed · blocked',failed:'Not completed',unknown:'Result unverified',verified:'Result verified'}};
 for(const locale of ['vi','en'])for(const state of Object.keys(labels[locale])){
  const outcome={version:1,protocolStatus:'completed',taskStatus:state==='verified'?'completed':state,verificationStatus:state==='verified'?'verified':'unverified',evidenceRefs:[],unresolvedCallIds:[],stopReason:null};
  const html=renderToStaticMarkup(React.createElement(ResponseActivity,{tools:[],progress:['Probe completed'],hasContent:true,locale,autoExpandTools:false,animated:false,isStreaming:false,status:'completed',outcome}));
  assert(html.includes(labels[locale][state]),`${locale}/${state}`);if(state!=='verified')assert(!html.includes(labels[locale].verified));
 }
}finally{await vite.close();}
console.log('VI/EN outcome labels distinguish partial, blocked, failed, unverified and independently verified results');
