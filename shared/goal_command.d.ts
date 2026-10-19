export type GoalCommand = {kind:'show'|'clear'|'pause'|'resume'|'invalid-edit'} | {kind:'create'|'edit';objective:string};
export function parseGoalCommand(rawInput:string):GoalCommand;
