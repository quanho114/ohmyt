import type { Message } from './types.ts';

// The live bubble owns this run until its saved snapshot replaces it.
export function visibleSavedMessages(messages: Message[], streamingRunId: string | null | undefined): Message[] {
  if (!streamingRunId) return messages;
  return messages.filter(message => {
    if (message.sender !== 'agent' || !message.metadata) return true;
    try { return JSON.parse(message.metadata).activity?.runId !== streamingRunId; }
    catch { return true; }
  });
}
