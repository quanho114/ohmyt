export type RunScope = Readonly<{scopeId:string;projectId?:string|null;canonicalRoot?:string|null;approvalMode:'manual'|'auto';runId?:string}>;
export type ToolStatus = 'success'|'error'|'denied'|'cancelled'|'unknown';
export interface ToolResult {callId:string;status:ToolStatus;modelContent:string;artifactRefs:string[];executionReceipt:Readonly<{status:ToolStatus;startedAt?:number;endedAt?:number;error?:string}>}
export interface SessionEvent {sessionId:string;seq:number;eventId:string;version:1;type:string;payload:Record<string,unknown>;createdAt:number}
export interface RequestAttempt {attemptId:string;turnId:string;stepId:string;status:'running'|'completed'|'failed'|'aborted';usage?:Record<string,number>}
export interface AgentHandle {id:string;sessionId:string;scope:RunScope;state:'idle'|'running'|'pause_requested'|'paused'|'disposed';run(input:Record<string,unknown>):Promise<unknown>;pause():void;resume():void;abort(reason?:string):void;dispose():Promise<void>}
export interface ClientContribution {id:string;owner:string;slot:'settings.section'|'activity.renderer'|'artifact.renderer'|'sidepanel.view';priority:number}
export function validateSessionEvent(event:unknown):SessionEvent;
export function validateToolResult(result:unknown):ToolResult;
