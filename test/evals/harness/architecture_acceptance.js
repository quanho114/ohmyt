import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const defaults=[
  ['invocation','harness/test_harness_invocation.js'],['delegation','harness/test_harness_invocation_paths.js'],
  ['quiescence','harness/test_harness_invocation_lifecycle.js'],['migration','harness/test_harness_history_authority.js'],
  ['atomic-completion','harness/test_harness_session_commit.js'],['plugin-ownership','harness/test_harness_plugin_ownership.js'],
  ['context-budget','harness/test_harness_request_budget.js'],['scoped-mcp','harness/test_harness_connectors.js'],
  ['child-cancellation','harness/test_harness_lifecycle.js'],['steering','harness/test_harness_controls.js'],
  ['browser-stop','harness/test_harness_browser_stop.js'],['recoverable-rejection','harness/test_harness_rejections.js'],
  ['truthful-outcome','harness/test_harness_outcomes.js'],['shared-model-admission','harness/test_harness_model_admission.js'],
  ['canonical-observation','harness/test_harness_observations.js'],['process-crash-cuts','harness/test_harness_crash_recovery.js'],
  ['summary-reuse','harness/test_harness_compaction_reuse.js'],['independent-task-oracles','harness/test_harness_task_oracles.js'],['child-outcome','harness/test_harness_child_outcome.js'],['uncertain-mutation','harness/test_harness_uncertain_write.js'],['outcome-ui','harness/test_harness_outcome_ui.js'],['model-quiescence','harness/test_harness_model_quiescence.js'],['durable-goals','goals/test_harness_goals.js'],['goal-crash-cuts','goals/test_harness_goal_crash.js'],['goal-api','goals/test_harness_goal_api.js'],['oversized-summary','harness/test_harness_summary_chunks.js']
].map(([scenario,file])=>({scenario,args:[path.join(root,'test',file)]}));

export async function runAcceptance({cases=defaults,record=()=>{}}={}){
  let failed=false,revision='unavailable',workingTreeDirty=null;
  const hash=createHash('sha256');
  for(const directory of ['server','src','shared','electron','test/fixtures/harness'])for(const name of fs.readdirSync(path.join(root,directory),{recursive:true}).sort()){const file=path.join(root,directory,name);if(fs.statSync(file).isFile()){hash.update(directory+'/'+name);hash.update(fs.readFileSync(file));}}
  for(const {args} of defaults){hash.update(path.relative(root,args[0]));hash.update(fs.readFileSync(args[0]));}
  for(const file of ['test/harness_fixture.js','test/goals/test_harness_goal_ui.cjs','test/goals/test_harness_goal_controls_ui.cjs','package.json','package-lock.json']){hash.update(file);hash.update(fs.readFileSync(path.join(root,file)));}
  const sourceHash=hash.digest('hex');
  try{revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
  try{workingTreeDirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim());}catch{}
  for(const {scenario,args} of cases){
    const start=Date.now(),result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
    const passed=result.status===0&&!result.error;failed ||= !passed;
    record({revision,sourceHash,workingTreeDirty,scenario,modelRoute:'offline-fixtures',fixtureVersion:2,budgets:null,trial:1,status:passed?'passed':'failed',durationMs:Date.now()-start,usage:null,errorCode:result.error?.code || (passed?null:`EXIT_${result.status ?? result.signal}`)});
    // Raw child output is deliberately excluded from the portable result record.
    if(!passed&&cases===defaults)process.stderr.write(result.stderr || 'Architecture acceptance failed\n');
  }
  return failed?1:0;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.exitCode=await runAcceptance({record:r=>process.stdout.write(JSON.stringify(r)+'\n')});
}
