export type TaskWorkflowId = 'project-overview' | 'code-review' | 'document-summary' | 'email-draft';
export const TASK_WORKFLOW_IDS: TaskWorkflowId[];
export function validTaskWorkflow(id: unknown): id is TaskWorkflowId;
export function requiresTaskReview(toolName: string): boolean;
export const TASK_WORKFLOW_GUIDANCE: Record<TaskWorkflowId,string>;
export function sessionTaskWorkflow(db: {getSession(id: string): unknown}, session: unknown): TaskWorkflowId | null;
