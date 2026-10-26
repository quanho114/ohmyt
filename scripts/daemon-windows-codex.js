// Explicit opt-in launcher: Codex sandbox permits broad host reads, scoped writes,
// and can repair provisioned Windows sandbox accounts/ACLs/network rules.
if(process.platform!=='win32')throw Error('This launcher is Windows-only');
process.env.OHMYT_WINDOWS_SANDBOX='codex';
const {createDaemon}=await import('../server/index.js');
const daemon=createDaemon({hostEnabled:true});
let stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;await daemon.stop();};
process.once('SIGINT',()=>{stop().catch(error=>{console.error(error);process.exitCode=1;});});
process.once('SIGTERM',()=>{stop().catch(error=>{console.error(error);process.exitCode=1;});});
try {const address=await daemon.start();console.log('Windows Codex sandbox daemon listening',address);}
catch(error){await stop();throw error;}
