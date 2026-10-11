import assert from 'node:assert/strict';
import {ToolRegistry} from '../server/tools.js';
import {BrowserBridge} from '../server/browser_bridge.js';
const registry=new ToolRegistry({},process.cwd(),{hostEnabled:true});
const browser=new BrowserBridge();browser.registerTools(registry);
const standalone=registry.forStandalone({scopeId:'standalone:test',sessionId:'test'});
for(const name of ['fs_read','fs_write','fs_list','shell_exec']){
 assert.equal(standalone.get(name),undefined);
 assert.throws(()=>standalone.validateCall({name,arguments:{}}),/Unknown tool/);
}
assert.ok(standalone.get('browser_read'));assert.ok(standalone.get('memory_search'));
assert.equal(standalone.describeRuntime().filesystemAccess,true);
assert.ok(standalone.get('shell_host'));
assert.ok(standalone.get('runtime_info'));
assert.ok(!JSON.stringify(standalone.describeRuntime()).includes(process.cwd()));
assert.ok(registry.get('fs_read'));await browser.close();
console.log('PASS standalone: permission-gated host shell, no workspace tools or application root disclosure; browser retained');
