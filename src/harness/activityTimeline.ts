import type {ToolCallItem} from '../types.ts';

export type ActivityEntry = {kind:'reasoning'; key:string; text:string; tail:boolean}
  | {kind:'tool'; key:string; tool:ToolCallItem};

/** Offsets refer to recorded provider text, never inferred task completion.
 * Older receipts lack offsets: retain their original reasoning-then-tools order. */
export function activityTimeline(reasoning:string, tools:ToolCallItem[]):ActivityEntry[] {
  const entries:ActivityEntry[] = [];
  let cursor = 0;
  for (const tool of tools) {
    const offset = typeof tool.reasoningOffset === 'number' && Number.isFinite(tool.reasoningOffset)
      ? Math.max(cursor, Math.min(reasoning.length, Math.floor(tool.reasoningOffset))) : reasoning.length;
    if (offset > cursor && reasoning.slice(cursor,offset).trim())
      entries.push({kind:'reasoning',key:`reasoning:${cursor}`,text:reasoning.slice(cursor,offset),tail:false});
    cursor = offset;
    entries.push({kind:'tool',key:`tool:${tool.id}`,tool});
  }
  if (reasoning.slice(cursor).trim())
    entries.push({kind:'reasoning',key:`reasoning:${cursor}`,text:reasoning.slice(cursor),tail:true});
  return entries;
}
