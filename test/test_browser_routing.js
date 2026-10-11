import assert from 'node:assert/strict';
import {authorizeTool} from '../server/harness/authorization.js';
const scope={scopeId:'standalone:s',approvalMode:'full'},signal=new AbortController().signal;
let policyCalls=0;
const loop={permissions:{evaluate:()=>{policyCalls++;return {action:'ALLOW'};}},emitEvent(){}};
const base={toolContext:{runId:'r',scope,signal},agent:{policy_json:'{}'},session:{id:'s'},messages:[],runTools:{browserBridge:{nativeCommand:()=>{},status:()=>({tabs:[]})}},onReview(){},target:''};
for(const command of ['xdg-open https://www.facebook.com','google-chrome https://google.com','open https://example.com','Start-Process https://example.com']){
 const result=await authorizeTool(loop,{...base,prompt:'mở facebook',call:{name:'shell_host',arguments:{command}}});assert.equal(result.action,'DENY',command);assert.match(result.reason,/browser_open/);
}
assert.equal(policyCalls,0);
assert.equal((await authorizeTool(loop,{...base,prompt:'mở Chrome desktop bên ngoài app',call:{name:'shell_host',arguments:{command:'xdg-open https://example.com'}}})).action,'ALLOW');
assert.equal((await authorizeTool(loop,{...base,prompt:'kiểm tra máy',call:{name:'shell_host',arguments:{command:'uname -a'}}})).action,'ALLOW');
console.log('Embedded browser default prevents OS website launches; explicit external browser and ordinary shell remain authorized');
