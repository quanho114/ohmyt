import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const handlers = [];
const memory = {};
let scriptArgs;
const fakeChrome = {
  storage:{local:{get:async()=>({}),set:async()=>{}}},
  alarms:{create:async()=>{},onAlarm:{addListener:handler=>handlers.push(handler)}},
  runtime:{onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}},onMessage:{addListener:()=>{}}},
  tabs:{query:async()=>[{id:1,url:'https://example.com/',title:'Page'},{id:2,url:'chrome://settings/'},{id:3,url:'https://example.com/',incognito:true}],get:async()=>({url:'https://example.com/'}),update:async()=>({})},
  scripting:{executeScript:async args=>{scriptArgs=args;return [{result:{text:'page'}}];}}
};
globalThis.chrome = fakeChrome;
const {execute,pageAction} = await import('../chrome-extension/background.js');
assert.equal((await execute({action:'tabs',args:{}})).length,1);
await assert.rejects(execute({action:'eval',args:{}}),/không hợp lệ/);
await assert.rejects(execute({action:'read',args:{tabId:1,expectedOrigin:'https://other.example'}}),/đổi trang/);
await assert.rejects(execute({action:'navigate',args:{tabId:1,expectedOrigin:'https://example.com',url:'https://other.example/'}}),/Chỉ điều hướng/);
await assert.rejects(execute({action:'type',args:{tabId:1,expectedOrigin:'https://example.com',text:'x'.repeat(10001)}}),/quá dài/);
await execute({action:'read',args:{tabId:1,expectedOrigin:'https://example.com'}});
assert.equal(scriptArgs.world,'ISOLATED');
assert.deepEqual(scriptArgs.target,{tabId:1});
fakeChrome.scripting.executeScript=async()=>[{result:{__ohmytError:'stale element'}}];
await assert.rejects(execute({action:'click',args:{tabId:1,expectedOrigin:'https://example.com'}}),/stale element/);

// Exercise the injected DOM function in a controlled page context.
const element = {
  tagName:'BUTTON',isConnected:true,disabled:false,innerText:'Continue',name:'',id:'',autocomplete:'',
  getClientRects:()=>[{}],matches:()=>false,getAttribute:()=>null,scrollIntoView:()=>{},click:()=>{memory.clicked=true;}
};
const password = {...element,tagName:'INPUT',name:'password',innerText:'',matches:()=>true};
const context = vm.createContext({location:{origin:'https://example.com',href:'https://example.com/'},document:{title:'Page',body:{innerText:'Visible text'},querySelectorAll:()=>[element,password]},getComputedStyle:()=>({visibility:'visible'}),crypto:{randomUUID:()=> 'snapshot-unique'},window:{scrollBy:args=>{memory.scroll=args.top;}},innerHeight:1000,HTMLInputElement:class{},HTMLTextAreaElement:class{},Event:class{}});
vm.runInContext(`var pageAction = ${pageAction.toString()}`,context);
const snapshot=vm.runInContext("pageAction('read',{expectedOrigin:'https://example.com'})",context);
assert.equal(snapshot.elements.length,1);
assert.equal(snapshot.text,'Visible text');
context.elementId=snapshot.elements[0].id;
vm.runInContext("pageAction('click',{expectedOrigin:'https://example.com',elementId})",context);
assert.equal(memory.clicked,true);
element.isConnected=false;
assert.match(vm.runInContext("pageAction('click',{expectedOrigin:'https://example.com',elementId})",context).__ohmytError,/thay đổi/);
assert.match(vm.runInContext("pageAction('read',{expectedOrigin:'https://other.example'})",context).__ohmytError,/chuyển sang trang khác/);
vm.runInContext("pageAction('scroll',{expectedOrigin:'https://example.com',direction:'down'})",context);
assert.equal(memory.scroll,800);
const manifest=JSON.parse(fs.readFileSync(new URL('../chrome-extension/manifest.json',import.meta.url)));
assert.equal(manifest.manifest_version,3);
assert.equal(manifest.permissions.includes('debugger'),false);
assert.equal(manifest.permissions.includes('cookies'),false);
assert.ok(manifest.optional_host_permissions.includes('https://*/*'));
console.log('✓ Chrome extension: tab filtering, isolated execution, origin checks, sensitive fields, stale elements and DOM actions');
