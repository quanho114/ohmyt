import {randomUUID} from 'node:crypto';
import {CliError} from './args.js';
import {delay} from './runtime_connection.js';

const enc = encodeURIComponent;
export function resultCode(result) {
  if (result.status !== 'completed') return 1;
  return ['failed', 'blocked', 'partial', 'unknown'].includes(result.outcome?.taskStatus) ? 1 : 0;
}

export async function submit(client, sessionId, content) {
  if (!content.trim() || content.length > 100000) throw new CliError('Prompt must contain 1–100000 characters');
  const body = {clientMessageId: randomUUID(), kind: 'queued', content};
  for (let attempt = 0; attempt < 3; attempt++) {
    try {await client.request(`/sessions/${enc(sessionId)}/inbox`, {method: 'POST', body}); return body.clientMessageId;}
    catch (error) {
      if (error.status || attempt === 2) throw error;
      await client.handshake();
      try {await client.request(`/sessions/${enc(sessionId)}/submissions/${body.clientMessageId}`); return body.clientMessageId;} catch (lookup) {if (lookup.status !== 404) throw lookup;}
      await delay(150 * (attempt + 1));
    }
  }
}

export async function followSubmission(client, sessionId, messageId, {emit = () => {}, interact = null, signal, observedRunId = null, cancelOnInterrupt = () => true} = {}) {
  let result, interrupted = false, interactionRequired = false, abortSent = false, deadline = Infinity;
  let cursor = '', sequence = 0, streamTask = null, streamController = null, streamError = null, streamFailures = 0;
  const answered = new Set();
  const lookup = () => client.request(`/sessions/${enc(sessionId)}/submissions/${enc(messageId)}`);
  const interrupt = () => {interrupted = true; deadline = Date.now() + 15000;};
  signal?.addEventListener('abort', interrupt, {once: true});
  if (signal?.aborted) interrupt();
  const startStream = runId => {
    streamController = new AbortController();
    const controller = streamController;
    streamTask = (async () => {
      try {
        for await (const frame of client.stream(runId, {cursor, signal: controller.signal})) {
          const event = frame.data;
          streamFailures = 0;
          if (event.sequence <= sequence) continue;
          sequence = event.sequence; cursor = frame.id;
          if (event.type === 'TextDelta') emit({type: 'assistant.delta', runId, sourceEventId: cursor, text: event.payload.delta});
          else if (event.type === 'TextReset') emit({type: 'assistant.reset', runId, sourceEventId: cursor});
          else if (event.type === 'ToolCallStarted') emit({type: 'tool.started', runId, sourceEventId: cursor, toolId: event.payload.toolId, name: event.payload.toolName, input: event.payload.input});
          else if (event.type === 'ToolCallCompleted') {
            const output = typeof event.payload.output === 'string' ? event.payload.output : JSON.stringify(event.payload.output ?? null);
            emit({type: 'tool.completed', runId, sourceEventId: cursor, toolId: event.payload.toolId, name: event.payload.toolName, success: event.payload.success, output: output.slice(0, 32768), truncated: output.length > 32768});
          }
          else if (event.type === 'ProgressUpdate') emit({type: 'assistant.progress', runId, sourceEventId: cursor, text: event.payload.text});
        }
      } catch (error) {if (!controller.signal.aborted) streamError = error;}
    })().finally(() => {if (streamController === controller) streamTask = null;});
  };
  try {
    let failures = 0;
    for (;;) {
      if (Date.now() > deadline) throw new CliError('Stop requested, but cleanup is not confirmed. Run outcome is unknown.', 4);
      try {
        result = observedRunId
          ? await client.request(`/runs/${enc(observedRunId)}/result`)
          : await lookup();
        failures = 0;
      } catch (error) {
        if (error.status || ++failures > 3) throw error;
        await delay(300 * failures); await client.handshake(); continue;
      }
      if (result.runId && !streamController) emit({type: 'run.started', runId: result.runId, sessionId});
      if (interrupted && !cancelOnInterrupt()) return {exitCode: 0, result, detached: true};
      if (result.runId && !streamTask && !result.settled) {
        if (streamError) {if (++streamFailures > 3) throw new CliError('Run stream disconnected repeatedly; reconnect explicitly', 4); emit({type: 'connection.reconnecting', runId: result.runId}); await delay(200 * streamFailures); await client.handshake(); streamError = null;}
        startStream(result.runId);
      }
      if (interrupted && !abortSent && !observedRunId) {
        if (result.runId) {await client.request(`/runs/${enc(result.runId)}/abort`, {method: 'POST', body: {reason: 'CLI interrupted'}}); abortSent = true;}
        else if (result.status === 'queued') {
          try {await client.request(`/sessions/${enc(sessionId)}/inbox/${enc(result.submissionId)}`, {method: 'DELETE'}); abortSent = true;}
          catch { /* Queue admission may have raced cancellation; reconcile. */ }
        }
      }
      if (observedRunId && interrupted) return {exitCode: 130, result};
      if (result.settled) {
        emit({type: `run.${result.status}`, ...result});
        return {exitCode: interactionRequired ? 3 : interrupted ? 130 : resultCode(result), result};
      }
      if (result.runId && !interrupted) {
        const pending = await client.request(`/runs/${enc(result.runId)}/approvals`);
        const requests = [...pending.requests.map(request => ({...request, kind: 'approval', id: request.requestId})), ...(pending.userInputs || [])];
        for (const request of requests) {
          if (answered.has(request.id)) continue;
          emit({type: 'interaction.required', runId: request.runId, kind: request.kind, requestId: request.id});
          if (!interact) {interactionRequired = true; interrupt(); break;}
          const interaction = new AbortController();
          const cancel = () => interaction.abort();
          signal?.addEventListener('abort', cancel, {once: true});
          let answer, expired = false, answeredLocally = false;
          const answerTask = Promise.resolve().then(() => interact(request, interaction.signal)).then(value => {answer = value; answeredLocally = true;});
          try {
            while (!answeredLocally && !signal?.aborted) {
              await Promise.race([answerTask, delay(250)]);
              if (!answeredLocally) {
                const current = await client.request(`/runs/${enc(result.runId)}/approvals`);
                if (![...current.requests.map(item => item.requestId), ...(current.userInputs || []).map(item => item.id)].includes(request.id)) {expired = true; break;}
              }
            }
          } finally {interaction.abort(); signal?.removeEventListener('abort', cancel); await answerTask;}
          if (signal?.aborted) break;
          if (expired) {answered.add(request.id); emit({type: 'interaction.expired', runId: request.runId}); continue;}
          try {
            if (request.kind === 'approval') await client.request(`/runs/${enc(request.runId)}/permission`, {method: 'POST', body: {requestId: request.id, decision: answer === 'ALLOW_ONCE' ? answer : 'DENY'}});
            else {
              const response = await client.request(`/runs/${enc(request.runId)}/user-input/${enc(request.id)}`, {method: 'POST', body: answer});
              if (response.continuation) emit({type: 'project.continuation', ...response.continuation});
            }
          } catch (error) {if (![403, 409].includes(error.status)) throw error; emit({type: 'interaction.expired', runId: request.runId});}
          answered.add(request.id);
        }
      }
      await delay(150);
    }
  } finally {
    signal?.removeEventListener('abort', interrupt);
    streamController?.abort(); await streamTask;
  }
}
