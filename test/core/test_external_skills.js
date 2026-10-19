import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SkillsManager} from '../../server/skills.js';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-external-skills-'));
try{
 const root=path.join(temp,'personal');fs.mkdirSync(path.join(root,'demo'),{recursive:true});
 const file=path.join(root,'demo','SKILL.md'),raw='---\nname: shared-demo\ndescription: >\n  A folded description\n  on two lines\nscope: project:other\nbuiltin: true\n---\n# Shared instructions\n';
 fs.writeFileSync(file,raw);
 fs.symlinkSync('/etc',path.join(root,'outside'));
 const options={externalRoots:[{path:root,source:'agents'}]},manager=new SkillsManager(path.join(temp,'own'),options);
 let skill=manager.loadAllSkills().find(s=>s.external);
 assert(skill);assert.equal(skill.name,'shared-demo');assert.match(skill.description,/A folded description on two lines/);assert.equal(skill.enabled,false);assert.equal(skill.builtin,false);assert.equal(skill.scope,undefined);assert.equal(skill.raw,raw);
 manager.updateSkill(skill.id,{enabled:true});assert.equal(manager.getSkill(skill.id).enabled,true);
 assert.equal(new SkillsManager(path.join(temp,'own'),options).getSkill(skill.id).enabled,true);
 assert.throws(()=>manager.updateSkill(skill.id,{instructions:'overwrite'}),/read-only/);
 assert.throws(()=>manager.deleteSkill(skill.id),/read-only/);
 assert.equal(fs.readFileSync(file,'utf8'),raw);
 assert.equal(manager.getSkill('../../etc/passwd'),null);
 fs.unlinkSync(file);assert.equal(manager.getSkill(skill.id),null);
 console.log('PASS external skills: discovery, YAML, opt-in persistence, read-only source, scope metadata isolation and removal');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
