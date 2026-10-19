export type ToolActivityStatus='running'|'completed'|'blocked'|'error'|'unknown';
export function completedToolStatus(payload:{executionStatus?:unknown;success?:unknown;output?:unknown}):Exclude<ToolActivityStatus,'running'>;
