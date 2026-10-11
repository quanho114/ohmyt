import crypto from 'node:crypto';
import {createDaemon} from './index.js';
const config=JSON.parse(process.env.OHMYT_LOCAL_RUNTIME_CONFIG);
process.chdir(config.appRoot);
const daemon=createDaemon({workspaceRoot:config.workspaceRoot,dataDir:config.dataDir,dbPath:config.dbPath,hostEnabled:true,port:0,authToken:config.authToken});
const browserRequests = new Map();
daemon.browserBridge.nativeCommand = (action,args,signal) => new Promise((resolve,reject) => {
 const id=crypto.randomUUID();
 const cleanup=()=>{clearTimeout(timer);browserRequests.delete(id);signal?.removeEventListener('abort',abort);};
 const abort=()=>{process.parentPort.postMessage({type:'browser-cancel',id,tabId:args.tabId});cleanup();reject(new Error('Đã dừng thao tác trình duyệt.'));};
 const timer=setTimeout(()=>{cleanup();reject(new Error('Trình duyệt không phản hồi.'));},['files.download','files.capture_result'].includes(action)?40000:25000);
 browserRequests.set(id,{resolve:value=>{cleanup();resolve(value);},reject:error=>{cleanup();reject(error);}});
 signal?.addEventListener('abort',abort,{once:true});
 process.parentPort.postMessage({type:'browser-command',id,action,args});
});
daemon.browserBridge.registerNativeTools(daemon.tools);
const address=await daemon.start();
process.parentPort.postMessage({type:'ready',port:address.port});
process.parentPort.on('message',async event=>{
 if(event.data?.type==='browser-cdp-event'){for(const listener of daemon.browserBridge.cdpListeners)listener(event.data.event);return;}
 if(event.data?.type==='browser-result') {const r=browserRequests.get(event.data.id);if(r) event.data.error?r.reject(new Error(event.data.error)):r.resolve(event.data.result);return;}
 if(event.data?.type==='shutdown') {
  for(const runId of daemon.agentLoop.activeRuns.keys()) daemon.agentLoop.abortRun(runId,'Desktop application closed');
  await daemon.stop();process.exit(0);
 }
});
