import assert from 'node:assert/strict';
import * as groups from '../server/harness/plugins/workspace_tools.js';
import * as children from '../server/harness/plugins/subagents.js';
import * as artifacts from '../server/harness/plugins/artifacts.js';
import {createDaemon} from '../server/index.js';
assert.equal(typeof groups.workspaceToolsPlugin,'function','tool group plugin factory required');
assert.equal(typeof children.subagentsPlugin,'function');assert.equal(typeof artifacts.artifactsPlugin,'function');
const daemon=createDaemon({dbPath:':memory:',port:0});await daemon.harness.ready;
try{
 const memory=daemon.tools.get('memory_save'),web=daemon.tools.get('web_search');assert(memory);assert(web);
 const definition=daemon.harness.definitions.get('tools/memory');await daemon.harness.unmount('tools/memory');assert.equal(daemon.tools.get('memory_save'),undefined);assert.equal(daemon.tools.get('web_search'),web);
 await daemon.harness.mount(definition);assert.equal(daemon.tools.get('memory_save'),memory);assert.equal([...daemon.tools.tools.keys()].filter(n=>n==='memory_save').length,1);
 const before=daemon.agentLoop.listenerCount('event'),childPlugin=daemon.harness.definitions.get('agents/subagents');await daemon.harness.unmount('agents/subagents');assert.equal(daemon.agentLoop.listenerCount('event'),before-1);assert.equal(daemon.tools.get('subagent_spawn'),undefined);
 await daemon.harness.mount(childPlugin);assert.equal(daemon.agentLoop.listenerCount('event'),before);assert(daemon.tools.get('subagent_spawn'));
}finally{await daemon.stop();}
console.log('Extracted plugin ownership, reload and listener disposal passed');
