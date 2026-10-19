export interface SandboxStatus { provider?:string; available:boolean; reason:string|null }
export interface SandboxRequest {
  workspaceRoot:string;
  command:string;
  cwd?:string;
  timeout?:number;
  scope?:Readonly<{canonicalRoot:string;rootIdentity:string;scopeId:string}>|null;
}
export interface SandboxContext { runId?:string; signal?:AbortSignal; fileBroker?:boolean; stdin?:string }
export interface SandboxResult { command:string; exitCode:number|null; signal:string|null; stdout:string; stderr:string; success:boolean }
export interface SandboxProvider {
  status():SandboxStatus;
  execute(request:SandboxRequest,context?:SandboxContext):Promise<SandboxResult>;
  cancel(runId:string):boolean;
  dispose():Promise<void>;
}
export class WorkspaceSandbox implements SandboxProvider {
  constructor(provider:SandboxProvider);
  status():SandboxStatus;
  execute(request:SandboxRequest,context?:SandboxContext):Promise<SandboxResult>;
  cancel(runId:string):boolean;
  dispose():Promise<void>;
}
export function createWorkspaceSandbox(provider?:SandboxProvider):WorkspaceSandbox;
export function sandboxPlugin(sandbox:WorkspaceSandbox):{name:string;apply:(ctx:any)=>void};
