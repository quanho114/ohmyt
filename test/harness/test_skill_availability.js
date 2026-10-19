import assert from 'node:assert/strict';
import {skillPlugin} from '../../server/harness/host.js';
const entries=Array.from({length:65},(_,i)=>({id:`enabled-${i}`,name:`Skill ${i}`,enabled:true,instructions:`Instructions ${i}`}));
entries.push({id:'disabled',enabled:false},{id:'private',enabled:true,scope:'project:other'});
let section,tool;
skillPlugin({loadAllSkills:()=>entries}).apply({systemPrompt:{section:(_owner,value)=>{section=value;}},effect:fn=>fn(),tools:{register:value=>{tool=value;return ()=>{};}}});
for(const scope of [{scopeId:'standalone'},{projectId:'current',scopeId:'project:current'}]){
 const prompt=section.text({scope});
 assert(prompt.includes('enabled-64'),'catalog includes entries beyond forty');
 assert(!prompt.includes('- disabled:'));assert(!prompt.includes('- private:'));
 assert.equal((await tool.execute({id:'enabled-64'},{scope})).instructions,'Instructions 64');
 await assert.rejects(()=>tool.execute({id:'disabled'},{scope}),/unavailable/);
 await assert.rejects(()=>tool.execute({id:'private'},{scope}),/unavailable/);
}
entries[64].enabled=false;
await assert.rejects(()=>tool.execute({id:'enabled-64'},{scope:{projectId:'current',scopeId:'project:current'}}),/unavailable/);
console.log('PASS enabled skills available in standalone/project, full catalog, disabled and scoped restrictions');
