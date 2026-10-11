import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const defaults=[
  ['invocation','test_harness_invocation.js'],['delegation','test_harness_invocation_paths.js'],
  ['quiescence','test_harness_invocation_lifecycle.js'],['migration','test_harness_history_authority.js'],
  ['atomic-completion','test_harness_session_commit.js'],['plugin-ownership','test_harness_plugin_ownership.js'],
  ['context-budget','test_harness_request_budget.js'],['scoped-mcp','test_harness_connectors.js'],
  ['child-cancellation','test_harness_lifecycle.js'],['steering','test_harness_controls.js']
].map(([scenario,file])=>({scenario,args:[path.join(root,'test',file)]}));

export async function runAcceptance({cases=defaults,record=()=>{}}={}){
  let failed=false,revision='unavailable';
  try{revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
  for(const {scenario,args} of cases){
    const start=Date.now(),result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
    const passed=result.status===0&&!result.error;failed ||= !passed;
    record({revision,scenario,modelRoute:'offline-fixtures',fixtureVersion:1,budgets:{maxSteps:5,browserMaxSteps:20,contextTokens:24000,reserveTokens:4000,toolResultTokens:4000},trial:1,status:passed?'passed':'failed',durationMs:Date.now()-start,usage:null,errorCode:result.error?.code || (passed?null:`EXIT_${result.status ?? result.signal}`)});
    // Raw child output is deliberately excluded from the portable result record.
    if(!passed&&cases===defaults)process.stderr.write(result.stderr || 'Architecture acceptance failed\n');
  }
  return failed?1:0;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.exitCode=await runAcceptance({record:r=>process.stdout.write(JSON.stringify(r)+'\n')});
}
