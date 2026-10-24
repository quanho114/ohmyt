import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {harnessFixture} from '../harness_fixture.js';
import {createRunScope} from '../../server/project_scope.js';
import {unzipSync,strFromU8} from 'fflate';

// DOCX: create, read back, append, read again — a real round trip.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('ok');return {completed:true};}});
 try{
  const tools=d.tools;
  const written=await tools.get('office_write').execute({path:'reports/brief.docx',doc:{title:'Weekly brief',paragraphs:['Revenue is up 12% week over week.','Risks: two open escalations.']}});
  assert.equal(written.success,true);
  assert.ok(written.bytesWritten>0);
  const read=await tools.get('office_read').execute({path:'reports/brief.docx'});
  assert.equal(read.kind,'docx');
  assert.deepEqual(read.paragraphs,['Weekly brief','Revenue is up 12% week over week.','Risks: two open escalations.']);
  assert.match(read.text,/Revenue is up 12%/);
  // The package is a real zip with the parts Word expects.
  const files=unzipSync(new Uint8Array(fs.readFileSync(read.fullPath)));
  assert.ok(files['word/document.xml']);
  assert.match(strFromU8(files['[Content_Types].xml']),/wordprocessingml.document.main/);
  await tools.get('office_edit').execute({path:'reports/brief.docx',appendParagraphs:['Escalation 1 was resolved on Friday.']});
  const reread=await tools.get('office_read').execute({path:'reports/brief.docx'});
  assert.equal(reread.paragraphs.length,4);
  assert.match(reread.paragraphs.at(-1),/resolved on Friday/);
  assert.match(reread.paragraphs[1],/Revenue is up 12%/);
  await assert.rejects(tools.get('office_edit').execute({path:'reports/brief.docx'}),/appendParagraphs/);
  await assert.rejects(tools.get('office_write').execute({path:'reports/brief.docx',doc:{paragraphs:[42]}}),/paragraph/);
 }finally{await d.closeFixture();}
}
// XLSX: create with sheets, read the grid, edit a cell, verify, clear a cell.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('ok');return {completed:true};}});
 try{
  const tools=d.tools;
  await tools.get('office_write').execute({path:'data/metrics.xlsx',doc:{sheets:[
    {name:'Revenue',rows:[['Region','Q3','Q4'],['North',1200,1500],['South',900,null]]},
    {name:'Notes',rows:[['Prepared by','ohmyt agent']]}
  ]}});
  const read=await tools.get('office_read').execute({path:'data/metrics.xlsx'});
  assert.equal(read.kind,'xlsx');
  assert.deepEqual(read.sheetNames,['Revenue','Notes']);
  assert.deepEqual(read.sheets[0].rows[1],['North',1200,1500]);
  await tools.get('office_edit').execute({path:'data/metrics.xlsx',sheet:'Revenue',cell:'C3',value:1100});
  const after=await tools.get('office_read').execute({path:'data/metrics.xlsx'});
  assert.equal(after.sheets[0].rows[2][2],1100);
  await tools.get('office_edit').execute({path:'data/metrics.xlsx',cell:'A2',value:null});
  const cleared=await tools.get('office_read').execute({path:'data/metrics.xlsx'});
  assert.equal(cleared.sheets[0].rows.find(row=>row[0]==='North'),undefined);
  await assert.rejects(tools.get('office_edit').execute({path:'data/metrics.xlsx',cell:'not-a-cell',value:1}),/A1 notation/);
  await assert.rejects(tools.get('office_edit').execute({path:'data/metrics.xlsx',sheet:'Missing',cell:'A1',value:1}),/Sheet not found/);
  await assert.rejects(tools.get('office_write').execute({path:'data/bad.xlsx',doc:{sheets:[{name:'bad/name',rows:[['x']]}]}}),/Sheet names/);
 }finally{await d.closeFixture();}
}
// Workspace boundary: paths outside the workspace and unsupported kinds fail closed.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('ok');return {completed:true};}});
 try{
  const outside=path.join(d.fixtureRoot,'..','outside.xlsx');
  await assert.rejects(d.tools.get('office_read').execute({path:outside}),/outside workspace/);
  await assert.rejects(d.tools.get('office_write').execute({path:'../escape.docx',doc:{paragraphs:['x']}}),/outside workspace/);
  await assert.rejects(d.tools.get('office_write').execute({path:'doc.pptx',doc:{paragraphs:['x']}}),/supports .docx and .xlsx/);
  await assert.rejects(d.tools.get('office_read').execute({path:'notes.txt'}),/supports .docx and .xlsx|no such file|ENOENT/);
  const projectScope=(()=>{d.db.addProject('office-proj','Office proj',d.fixtureRoot);d.db.createSession('office-session','fixture','Office','office-proj');return createRunScope(d.db,d.db.getSession('office-session'),'project-office');})();
  for(const name of ['office_read','office_write','office_edit'])assert.equal(d.permissions.evaluate(name,'x',projectScope).action,'ALLOW');
 }finally{await d.closeFixture();}
}
console.log('✓ Office tools: docx/xlsx create-read-edit round trips, package validity, workspace boundary and permissions passed');
