import vm from 'node:vm';
import readline from 'node:readline';
let nextId=0,started=false;const waiting=new Map();
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const tools=Object.freeze({call:(name,args)=>new Promise((resolve,reject)=>{const id=++nextId;waiting.set(id,{resolve,reject});send({kind:'call',id,name,args});})});
const output=value=>send({kind:'output',value});
const lines=readline.createInterface({input:process.stdin});
lines.on('line',async line=>{
  const message=JSON.parse(line);
  if(message.kind==='result'){const item=waiting.get(message.id);if(!item)return;waiting.delete(message.id);message.error?item.reject(new Error(message.error)):item.resolve(message.value);return;}
  if(message.kind!=='start'||started)return;started=true;
  try{const context=vm.createContext({tools,output},{codeGeneration:{strings:false,wasm:false}});await new vm.Script(`(async()=>{${message.code}\n})()`).runInContext(context,{timeout:30000});send({kind:'done'});}
  catch(error){send({kind:'error',error:error.message});}
});
