export function enqueuePermission<T extends {requestId:string}>(queue:T[],request:T){return queue.some(p=>p.requestId===request.requestId)?queue:[...queue,request];}
export function removePermission<T extends {requestId:string}>(queue:T[],requestId:string){return queue.filter(p=>p.requestId!==requestId);}
