const {app,utilityProcess}=require('electron');
const path=require('node:path');

app.whenReady().then(async()=>{
  for(const test of ['test_project_isolation.js','test_large_sandbox.js']) {
    console.log(`Checking desktop utility process: ${test}`);
    await new Promise((resolve,reject)=>{
      const child=utilityProcess.fork(path.join(__dirname,'test_sandbox_desktop_worker.js'),[],{
        stdio:'pipe',env:{...process.env,OHMYT_SANDBOX_TEST:test}
      });
      const timer=setTimeout(()=>{child.kill();reject(new Error(`${test} timed out`));},60000);
      child.stdout.on('data',chunk=>process.stdout.write(chunk));
      child.stderr.on('data',chunk=>process.stderr.write(chunk));
      child.on('exit',code=>{
        clearTimeout(timer);
        if(code===0)resolve();else reject(new Error(`${test} failed (${code})`));
      });
    });
  }
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
