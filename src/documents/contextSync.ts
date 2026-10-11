const failures = new Map<string, unknown>();
const pending = new Map<string,Set<Promise<unknown>>>();
export function syncDocumentContext<T>(scope:string,work:()=>Promise<T>):Promise<T>{
  const jobs=pending.get(scope)||new Set<Promise<unknown>>();pending.set(scope,jobs);
  const task=Promise.resolve().then(work);jobs.add(task);
  const clean=()=>{jobs.delete(task);if(!jobs.size)pending.delete(scope);};task.then(()=>{failures.delete(scope);clean();},error=>{failures.set(scope,error);clean();});
  return task;
}
export async function waitDocumentContext(scope:string){
  while(pending.get(scope)?.size)await Promise.all([...pending.get(scope)!]);
  if(failures.has(scope))throw failures.get(scope);
}
