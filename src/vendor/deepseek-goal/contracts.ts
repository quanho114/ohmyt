import type { GoalKey } from './locales.ts';

export type GoalActivation = 'armed' | 'disarmed';
export interface GoalSnapshot {
  id: string;
  revision: number;
  objective: string;
  phase: 'active' | 'paused' | 'blocked' | 'complete';
  blockedReason?: {message:string};
}
export type GoalActionResult = {ok:true} | {ok:false;error:{code:string;message:string}};
export interface GoalBarActions {
  onEdit: (objective:string)=>Promise<GoalActionResult>;
  onPause: ()=>Promise<GoalActionResult>;
  onResume: ()=>Promise<GoalActionResult>;
  onClear: ()=>Promise<GoalActionResult>;
}
export type TodoKey = 'todo.title' | 'todo.status.completed' | 'todo.status.inProgress' | 'todo.status.pending' | 'todo.progress.done' | 'todo.progress.active' | 'todo.progress.pending';
export type TranslateNS<N extends string> = (key:N extends 'goal'?GoalKey:TodoKey, values?:Record<string,number>)=>string;
export interface PropsLocale<N extends string> {t:TranslateNS<N>}
export type TodoDockProps = PropsLocale<'conversation'>;
export interface TodoItem {id?:string;content:string;status:'completed'|'in_progress'|'pending'}
