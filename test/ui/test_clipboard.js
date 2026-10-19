import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({server:{middlewareMode:true}});
const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
try {
 const {copyToClipboard}=await vite.ssrLoadModule('/src/clipboard.ts');
 let removed=0,focused=0,legacy=0,written;
 globalThis.window={getSelection:()=>null};
 globalThis.document={activeElement:{focus:()=>focused++},body:{append:()=>{}},createElement:()=>({style:{},setAttribute:()=>{},focus:()=>{},select:()=>{},remove:()=>removed++}),execCommand:()=>{legacy++;return true;}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>{written=text;}}}});
 await copyToClipboard('  x\n\n');assert.equal(written,'  x\n\n');assert.equal(legacy,0);
 navigator.clipboard.writeText=async()=>{throw new Error('NotAllowedError');};
 await copyToClipboard('fallback');assert.equal(legacy,1);assert.equal(removed,1);assert.equal(focused,1);
 window.electronAPI={writeClipboard:async text=>{written=text;}};
 await copyToClipboard('native');assert.equal(written,'native');assert.equal(legacy,1);
 delete window.electronAPI;document.execCommand=()=>false;
 await assert.rejects(copyToClipboard('denied'),/Clipboard copy failed/);assert.equal(removed,2);assert.equal(focused,2);
 console.log('PASS clipboard: exact source, native copy, denied browser fallback, truthful failure and focus cleanup');
} finally {
 delete globalThis.window;delete globalThis.document;
 if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;
 await vite.close();
}
