import assert from 'node:assert/strict';
import {authorizeTool} from '../../server/harness/authorization.js';
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

// A URL fetch or local file open is not an external browser launch.
for(const command of [
 'curl -sL "https://docs.google.com/spreadsheets/d/example/export?format=csv" -o sheet.csv',
 `python3 -c 'import urllib.request; url="https://docs.google.com/example"; data=urllib.request.urlopen(url).read(); f=open("sheet.csv","wb"); f.write(data)'`,
 `python3 -c 'import urllib.request; url="https://docs.google.com/example"; print("open", url)'`,
 'echo open https://example.com',
]){
 const result=await authorizeTool(loop,{...base,prompt:'đọc nội dung link này',call:{name:'shell_host',arguments:{command}}});
 assert.equal(result.action,'ALLOW',command);
}
for(const command of [
 'curl https://example.com; xdg-open https://example.com',
 '"/usr/bin/xdg-open" "https://example.com"',
 `sh -c 'open https://example.com'`,
 'env DISPLAY=:0 chromium https://example.com',
 'powershell -NoProfile -Command "Start-Process https://example.com"',
])assert.equal((await authorizeTool(loop,{...base,prompt:'đọc link',call:{name:'shell_host',arguments:{command}}})).action,'DENY',command);
console.log('Read-only CSV fetches and Python file opens reach normal permission policy; browser launches stay blocked');
const denyLoop={...loop,permissions:{evaluate:()=>({action:'DENY',matchedPolicy:'fixture-scoped-deny'})}};
const deniedFetch=await authorizeTool(denyLoop,{...base,prompt:'đọc link',call:{name:'shell_host',arguments:{command:'curl https://example.com'}}});
assert.equal(deniedFetch.action,'DENY','A fetch is still subject to ordinary deny precedence');
assert.match(deniedFetch.reason,/fixture-scoped-deny/);
