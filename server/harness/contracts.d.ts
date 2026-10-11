export type RunScope = Readonly<{scopeId:string;projectId?:string|null;canonicalRoot?:string|null;approvalMode:'manual'|'auto';runId?:string}>;
export type ToolStatus = 'success'|'error'|'denied'|'cancelled'|'unknown';
export interface ToolResult {callId:string;status:ToolStatus;modelContent:string;artifactRefs:ReadonlyArray<{artifactId:string;sha256?:string;bytes?:number}>;executionReceipt:Readonly<{status:ToolStatus;startedAt?:number;endedAt?:number;version?:number;error?:string;bodyStarted?:boolean|null}>}
export interface SessionEvent {sessionId:string;seq:number;eventId:string;version:1;type:string;payload:Record<string,unknown>;createdAt:number}
export interface RequestAttempt {purpose?:string;accounting?:unknown;attemptId:string;turnId:string;stepId:string;status:'running'|'completed'|'failed'|'aborted';usage?:Record<string,number>}
export interface AgentHandle {id:string;sessionId:string;scope:RunScope;state:'idle'|'running'|'pause_requested'|'paused'|'disposed';run(input:Record<string,unknown>):Promise<unknown>;pause():void;resume():void;abort(reason?:string):void;dispose():Promise<void>}
export interface ClientContribution {id:string;owner:string;slot:'settings.section'|'activity.renderer'|'artifact.renderer'|'sidepanel.view';priority:number}
export function validateSessionEvent(event:unknown):SessionEvent;
export function validateToolResult(result:unknown):ToolResult;

export interface TaskOutcome {version:1;protocolStatus:"completed"|"failed"|"cancelled";taskStatus:"completed"|"partial"|"blocked"|"failed"|"unknown";verificationStatus:"verified"|"unverified"|"not_applicable";evidenceRefs:string[];unresolvedCallIds:string[];stopReason:string|null}

export interface GoalView {version:1;id:string;sessionId:string;projectId:string|null;revision:number;objective:string;phase:'active'|'paused'|'blocked'|'review_required'|'completed'|'cancelled';autoContinue:boolean;roundsStarted:number;limits:{rounds:number;requests:number;tools:number};usage:{used:{requests:number;tools:number};attempts:ReadonlyArray<{purpose:string;inputTokens:number|null;outputTokens:number|null;accounting:unknown}>};steps:ReadonlyArray<{id:string;text:string;status:'pending'|'in_progress'|'done'}>;evidenceRefs:ReadonlyArray<string>;reason:string|null;currentRound:{runId:string;round:number;status:string}|null}
