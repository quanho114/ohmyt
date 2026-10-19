export interface PtcStatus {available:boolean;reason?:string}
export interface PtcContext {runId?:string;signal?:AbortSignal;[key:string]:unknown}
export interface PtcRequest {code:string;signal?:AbortSignal;wallTimeMs?:number;maxSubcalls?:number;context?:PtcContext}
export interface PtcResult {output:unknown[];subcalls:number}
export interface PtcProvider {
  probe():Promise<PtcStatus>;
  execute(request:PtcRequest):Promise<PtcResult>;
  cancel(runId:string):boolean;
  dispose():Promise<void>;
}
export class PtcService implements PtcProvider {
  constructor(provider:PtcProvider);
  probe():Promise<PtcStatus>;
  execute(request:PtcRequest):Promise<PtcResult>;
  cancel(runId:string):boolean;
  dispose():Promise<void>;
}
export type PtcCall = (name:string,args:Record<string,unknown>,context:PtcContext)=>Promise<unknown>;
export function ptcRuntimePlugin(options:{call:PtcCall;providerFactory?:(options:{call:PtcCall})=>PtcProvider}):{name:string;apply:(ctx:any)=>void};
