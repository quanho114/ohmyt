export const EVENT_TYPES = new Set(['turn/start','turn/end','step/start','step/end','message/user','message/assistant','tool/call','tool/result','attempt/start','attempt/end','control/queued','control/consumed','control/cancelled','control/updated','control/state','context/summary','artifact/update','child/start','child/end']);
export function validateSessionEvent(event) {
  if (!event || typeof event !== 'object' || !event.sessionId || !event.eventId || typeof event.sessionId !== 'string' || typeof event.eventId !== 'string' || event.version !== 1 || !Number.isSafeInteger(event.seq) || event.seq < 1 || !EVENT_TYPES.has(event.type) || !event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload) || !Number.isSafeInteger(event.createdAt) || event.createdAt < 0) throw new Error('Invalid semantic session event');
  return event;
}
export function validateToolResult(result) {
  if (!result?.callId || !['success','error','denied','cancelled','unknown'].includes(result.status) || typeof result.modelContent !== 'string' || !Array.isArray(result.artifactRefs) || result.executionReceipt?.status !== result.status) throw new Error('Invalid authoritative tool result');
  return result;
}
