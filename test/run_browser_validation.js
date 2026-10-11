import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const browserFiles=['test_browser_cdp_children.js','test_browser_network_policy.cjs','test_browser_egress.js','test_browser_evaluate.js','test_browser_lifecycle.js','test_browser_integration.js','test_browser_api_integration.js','test_browser_use.js','test_browser_use_settings.js','test_browser_files.js','test_browser_vision.js','test_browser_bridge.js','test_chrome_extension.js','test_browser_use_protocol_smoke.js'];
const entries=browserFiles.map(file=>({group:'browser',name:file,command:process.execPath,args:['test/'+file]}));
for(const file of ['test_browser_use_integrated.cjs','test_browser_computer.cjs','test_browser_cursor.cjs'])entries.push({group:'browser',name:file,command:'xvfb-run',args:['-a',path.resolve('node_modules/.bin/electron'),'--no-sandbox','test/'+file]});
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
function addCore(script,depth=0){if(depth>5)throw Error('Recursive test scripts');for(const command of script.trim().split(' && ')){const match=command.trim().match(/^node (test\/[\w.]+)$/);if(match){entries.push({group:'core',name:match[1],command:process.execPath,args:[match[1]]});continue;}const nested=command.trim().match(/^npm run ([\w:-]+)$/);if(!nested||!pkg.scripts[nested[1]])throw Error('Unsupported core test command: '+command);addCore(pkg.scripts[nested[1]],depth+1);}}
addCore(pkg.scripts.test);
entries.push({group:'build',name:'vite build',command:'npm',args:['run','build']});
const results=[];
for(const entry of entries){
 const started=Date.now();let stdout='',stderr='',timedOut=false;
 const child=spawn(entry.command,entry.args,{shell:false,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',data=>{stdout=(stdout+data).slice(-15000);});child.stderr.on('data',data=>{stderr=(stderr+data).slice(-15000);});
 const kill=signal=>{try{process.platform==='win32'?child.kill(signal):process.kill(-child.pid,signal);}catch{}};
 let escalation;const timer=setTimeout(()=>{timedOut=true;kill('SIGTERM');escalation=setTimeout(()=>kill('SIGKILL'),5000);},90000);
 let startError;child.once('error',error=>{startError=error.code;});
 const exitCode=await new Promise(resolve=>child.once('close',resolve));clearTimeout(timer);clearTimeout(escalation);
 // Some daemon tests install process-level handlers that log assertions but exit 0.
 const assertionLogged=/AssertionError|test suite failed|UncaughtException/i.test(stdout+stderr);
 const passed=exitCode===0&&!timedOut&&!startError&&!assertionLogged;
 const metrics=stdout.split('\n').find(line=>line.startsWith('MEASUREMENTS '));
 const result={group:entry.group,name:entry.name,passed,exitCode,durationMs:Date.now()-started,timedOut,...(startError?{startError}:{}),...(metrics?{measurements:JSON.parse(metrics.slice(13))}:{}),...(!passed?{diagnostics:(stdout+'\n'+stderr).slice(-4000)}:{})};results.push(result);
 console.log(`${passed?'PASS':'FAIL'} ${entry.group}: ${entry.name} (${result.durationMs} ms)`);
}
fs.mkdirSync('output',{recursive:true});const report=path.resolve('output/browser-use-validation.json');fs.writeFileSync(report,JSON.stringify({date:new Date().toISOString(),platform:process.platform,node:process.version,results},null,2),{mode:0o600});console.log('Report: '+report);
process.exitCode=results.every(result=>result.passed)?0:1;
