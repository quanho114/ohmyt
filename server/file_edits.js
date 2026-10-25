// Also serialized into the isolated Node file broker. Keep this self-contained:
// only the host supplies modules and program source, never model-controlled code.
export function editTextFile(input,{fs,path,createHash,randomUUID}){
 const limit=2*1024*1024;
 const failure=(code,error)=>({success:false,applied:false,code,error});
 if(typeof input.expectedHash!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedHash)||
    typeof input.oldText!=='string'||!input.oldText||typeof input.newText!=='string'||
    Buffer.byteLength(input.oldText)>limit||Buffer.byteLength(input.newText)>limit||
    input.replaceAll!==undefined&&typeof input.replaceAll!=='boolean'||input.dryRun!==undefined&&typeof input.dryRun!=='boolean'){
  return failure('INVALID_EDIT','Use a SHA-256 from fs_read, nonempty oldText and literal newText (up to 2 MiB).');
 }
 const root=fs.realpathSync(input.root),target=path.resolve(root,input.path),relative=path.relative(root,target);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return failure('OUTSIDE_WORKSPACE','Edit target must be a file inside the workspace.');
 const safePath=()=>{
  let current=root;
  for(const part of relative.split(path.sep)){
   current=path.join(current,part);
   if(fs.lstatSync(current).isSymbolicLink())throw Error('Symlink edit targets are unsupported.');
  }
 };
 const read=()=>{
  safePath();
  const fd=fs.openSync(target,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
   const stat=fs.fstatSync(fd);
   if(!stat.isFile()||stat.nlink!==1||stat.size>limit)throw Error('Edit requires a regular file without hardlinks, up to 2 MiB.');
   const bytes=fs.readFileSync(fd);
   if(bytes.length>limit)throw Error('File exceeds the 2 MiB edit limit.');
   return {stat,bytes,hash:createHash('sha256').update(bytes).digest('hex')};
  }finally{fs.closeSync(fd);}
 };
 let original;
 try{original=read();}catch(error){return failure('UNSUPPORTED_FILE',error.message);}
 if(original.hash!==input.expectedHash)return failure('FILE_CHANGED','File changed since fs_read. Read the current version before editing.');
 const text=original.bytes.toString('utf8');
 if(text.includes('\0')||!Buffer.from(text,'utf8').equals(original.bytes))return failure('UNSUPPORTED_TEXT','Only valid UTF-8 text without NUL bytes can be edited.');
 if(input.oldText===input.newText)return failure('EDIT_NO_CHANGE','oldText and newText are identical.');
 const parts=text.split(input.oldText),count=parts.length-1;
 if(!count)return failure('EDIT_NOT_FOUND','oldText does not match. Read the relevant text and preserve its exact line endings.');
 if(count>1&&!input.replaceAll)return failure('EDIT_AMBIGUOUS','oldText appears more than once. Include unique context or explicitly use replaceAll.');
 const updated=parts.join(input.newText),bytes=Buffer.from(updated,'utf8');
 if(bytes.length>limit)return failure('EDIT_TOO_LARGE','Edited file exceeds 2 MiB.');
 const hash=createHash('sha256').update(bytes).digest('hex');
 // Bounded single-span diff for review, avoiding quadratic whole-file LCS.
 const before=text.split('\n'),after=updated.split('\n');
 let prefix=0,suffix=0;
 while(prefix<before.length&&prefix<after.length&&before[prefix]===after[prefix])prefix++;
 while(suffix<before.length-prefix&&suffix<after.length-prefix&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
 const start=Math.max(0,prefix-3),oldEnd=Math.min(before.length,before.length-suffix+3),newEnd=Math.min(after.length,after.length-suffix+3);
 const label=relative.split(path.sep).join('/').replace(/[\r\n\t]/g,'_');
 const lines=[`--- a/${label}`,`+++ b/${label}`,`@@ -${start+1},${oldEnd-start} +${start+1},${newEnd-start} @@`];
 let diffBytes=Buffer.byteLength(lines.join('\n')),diffTruncated=false;
 const add=(marker,line)=>{
  if(diffTruncated)return;
  const rendered=marker+line.replace(/\r$/,'');
  if(lines.length>=203||diffBytes+Buffer.byteLength(rendered)+1>16000){diffTruncated=true;return;}
  lines.push(rendered);diffBytes+=Buffer.byteLength(rendered)+1;
 };
 for(let i=start;i<prefix;i++)add(' ',before[i]);
 for(let i=prefix;i<before.length-suffix;i++)add('-',before[i]);
 for(let i=prefix;i<after.length-suffix;i++)add('+',after[i]);
 for(let i=before.length-suffix;i<oldEnd;i++)add(' ',before[i]);
 if(diffTruncated)lines.push('[Diff truncated; inspect the current file for omitted lines.]');
 const result={success:true,applied:!input.dryRun,previousHash:original.hash,sha256:hash,bytesWritten:input.dryRun?0:bytes.length,replacements:count,diff:lines.join('\n'),diffTruncated};
 if(input.dryRun)return result;
 // Prepare separately and recheck before rename. This is not an OS-level
 // compare-and-swap against a concurrently writing external process.
 const temporary=path.join(path.dirname(target),`.sky-edit-${randomUUID()}`);
 let fd;
 try{
  fd=fs.openSync(temporary,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,original.stat.mode&0o777);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  let latest;
  try{latest=read();}catch(error){return failure('FILE_CHANGED',error.message);}
  if(latest.hash!==original.hash||latest.stat.dev!==original.stat.dev||latest.stat.ino!==original.stat.ino||latest.stat.mode!==original.stat.mode){
   return failure('FILE_CHANGED','File changed while preparing the edit. Read its current version.');
  }
  fs.renameSync(temporary,target);
  return result;
 }finally{
  if(fd!==undefined)fs.closeSync(fd);
  try{fs.unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}
 }
}
