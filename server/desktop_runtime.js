import {createDaemon} from './index.js';
const config=JSON.parse(process.env.OHMYT_LOCAL_RUNTIME_CONFIG);
process.chdir(config.appRoot);
const daemon=createDaemon({workspaceRoot:config.workspaceRoot,dataDir:config.dataDir,dbPath:config.dbPath,hostEnabled:true,port:0,authToken:config.authToken});
const address=await daemon.start();
process.parentPort.postMessage({type:'ready',port:address.port});
process.parentPort.on('message',async event=>{
 if(event.data?.type==='shutdown') {
  for(const runId of daemon.agentLoop.activeRuns.keys()) daemon.agentLoop.abortRun(runId,'Desktop application closed');
  await daemon.stop();process.exit(0);
 }
});
