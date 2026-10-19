import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const vite=await createServer({server:{middlewareMode:true}});
try{
 const {ResponseActivity}=await vite.ssrLoadModule('/src/components/ResponseActivity.tsx');
 const {ToolCallCard}=await vite.ssrLoadModule('/src/components/ToolCallCard.tsx');
 const labels={vi:{partial:'Chi tiết thực hiện',blocked:'Chưa hoàn thành · gặp trở ngại',failed:'Chưa hoàn thành',unknown:'Kết quả chưa được xác minh',verified:'Đã xác minh kết quả'},en:{partial:'Execution details',blocked:'Not completed · blocked',failed:'Not completed',unknown:'Result unverified',verified:'Result verified'}};
 for(const locale of ['vi','en'])for(const state of Object.keys(labels[locale])){
  const outcome={version:1,protocolStatus:'completed',taskStatus:state==='verified'?'completed':state,verificationStatus:state==='verified'?'verified':'unverified',evidenceRefs:[],unresolvedCallIds:[],stopReason:null};
  const html=renderToStaticMarkup(React.createElement(ResponseActivity,{tools:[],progress:['Probe completed'],hasContent:true,locale,autoExpandTools:false,animated:false,isStreaming:false,status:'completed',outcome}));
  assert(html.includes(labels[locale][state]),`${locale}/${state}`);if(state!=='verified')assert(!html.includes(labels[locale].verified));
 }
 for(const hasContent of [true,false]){
  const html=renderToStaticMarkup(React.createElement(ResponseActivity,{tools:[{id:'probe',name:'shell_host',input:{},status:'error',output:{exitCode:1}}],progress:[],hasContent,locale:'vi',animated:false,isStreaming:false,status:'warnings',outcome:{taskStatus:'partial',protocolStatus:'completed',verificationStatus:'unverified',unresolvedCallIds:['probe']}}));
  assert(html.includes(hasContent?'Chi tiết thực hiện':'Có bước lỗi · cần kiểm tra kết quả'));
  assert(!html.includes('Đã xác minh kết quả'));assert(!html.includes('Chưa hoàn thành toàn bộ'));
 }
 for(const locale of ['vi','en']){
  const props={tools:[{id:'type',name:'browser_type',input:{text:'hello vn'},status:'completed'}],hasContent:true,locale,autoExpandTools:false,animated:false,isStreaming:false,status:'completed',outcome:{version:1,protocolStatus:'completed',taskStatus:'unknown',verificationStatus:'unverified',unresolvedCallIds:[],stopReason:null}};
  const html=renderToStaticMarkup(React.createElement(ResponseActivity,props));
  assert(html.includes(locale==='vi'?'Đã thực hiện các bước':'Steps executed'));
  assert(!html.includes('data-state="error"'),'Successful steps without a verifier are not an error');
  assert(!html.includes(locale==='vi'?'Đã xác minh kết quả':'Result verified'));
  for(const override of [{unresolvedCallIds:['missing']},{protocolStatus:'failed'},{stopReason:'blocked'}]){
   const uncertain=renderToStaticMarkup(React.createElement(ResponseActivity,{...props,outcome:{...props.outcome,...override}}));
   assert(!uncertain.includes(locale==='vi'?'Đã thực hiện các bước':'Steps executed'));
  }
 }
 for(const locale of ['vi','en'])for(const toolStatus of ['unknown','error']){
  const html=renderToStaticMarkup(React.createElement(ResponseActivity,{tools:[{id:'write',name:'fs_write',input:{path:'draft.txt'},status:toolStatus,output:{code:'TOOL_OUTCOME_UNKNOWN'}}],hasContent:true,locale,autoExpandTools:false,animated:false,isStreaming:false,status:'error',outcome:{taskStatus:'unknown',verificationStatus:'unverified'}}));
  assert(html.includes(locale==='vi'?'Chưa rõ kết quả':'Outcome unknown'));
  assert(html.includes(locale==='vi'?'Kiểm tra trạng thái thực tế trước khi thử lại.':'Check the actual state before retrying.'));
  assert(!html.includes('data-state="completed"'),'An uncertain effect cannot have a completed checkmark');
 }
 for(const status of ['unknown','error','completed']){
  const html=renderToStaticMarkup(React.createElement(ToolCallCard,{tool:{id:'legacy',name:'fs_write',input:{path:'draft.txt'},status,output:{code:'TOOL_OUTCOME_UNKNOWN'}},autoExpandTools:false}));
  assert(html.includes('Chưa rõ kết quả'));assert(html.includes('Kiểm tra trạng thái thực tế trước khi thử lại.'));assert(!html.includes('Hoàn tất'));
 }
}finally{await vite.close();}
console.log('VI/EN outcome labels distinguish partial, blocked, failed, unverified and independently verified results');
