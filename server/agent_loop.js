import {EventEmitter} from 'node:events';
import {freezeValue} from './harness/prompt.js';
import {buildDefaultPrompt} from './harness/default_prompt.js';
import {executeTurn} from './harness/driver.js';
// Only flag replies made entirely of promises to act; factual answers remain untouched.
export function isProgressOnlyReply(text) {
  const sentences = text.trim().split(/[.!?。\n]+/u).map(sentence => sentence.trim()).filter(Boolean);
  return sentences.length > 0 && sentences.every(sentence => /^(?:(?:tôi|mình|tui|em|ta)\s+sẽ\s+(?:kiểm tra|xem|đọc|tìm|chạy|thực hiện|xác minh|tổng hợp)|i(?:\s+will|'ll|’ll| am going to)\s+(?:check|inspect|read|search|run|verify|summari[sz]e))\b/iu.test(sentence));
}

export class AgentLoop extends EventEmitter {
  constructor({ db, tools, permissions, skills, llm, gateway = null, registry = null }) {
    super();
    this.db = db;
    this.tools = tools;
    this.permissions = permissions;
    this.skills = skills;
    this.llm = llm;
    this.gateway = gateway;
    this.registry = registry;
    this.activeRuns = new Map(); // runId -> { abortController, sessionId }
    this._seqByRun = new Map();
    this.pendingRuns = new Set();
    this.harness = null;
  }

  abortRun(runId, reason = 'Người dùng kích hoạt Take Control') {
    const active = this.activeRuns.get(runId);
    if (!active) return false;

    active.abortController.abort();
    void this.tools.browserUse?.releaseRun(runId).catch(() => {});
    this.tools.killProcessesForRun(runId);
    this.permissions.cancelForRun?.(runId);
    this.db.updateRunStatus(runId, 'aborted', reason);
    if (active.activity) {
      const activity = { ...active.activity, tools: active.activity.tools.map(tool => tool.status === 'running' ? { ...tool, status: 'blocked' } : tool), durationMs: Date.now() - active.activity.startedAt, status: 'aborted' };
      this.db.addMessage('msg_' + Math.random().toString(36).substring(2, 10), active.sessionId, 'agent', 'Đã dừng phản hồi.', { activity });
    }

    this.emitEvent(runId, 'RunAborted', { runId, reason, timestamp: Date.now() });
    this.activeRuns.delete(runId);
    return true;
  }

  emitEvent(runId, eventType, payload) {
    const activity = this.activeRuns.get(runId)?.activity;
    if (activity) {
      if (eventType === 'ReasoningDelta') activity.reasoning += payload.delta;
      if (eventType === 'ToolCallStarted') activity.tools.push({ id: payload.toolId, name: payload.toolName, input: payload.input, status: 'running' });
      if (eventType === 'ToolCallCompleted') {
        const tool = activity.tools.find(tool => tool.id === payload.toolId);
        if (tool) Object.assign(tool, { output: payload.output, durationMs: payload.durationMs, status: payload.success ? 'completed' : 'error' });
      }
      if (eventType === 'ToolCallBlocked') {
        activity.tools.push({ id: payload.toolId || `blocked_${activity.tools.length}`, name: payload.toolName, input: { target: payload.target }, output: payload.reason, status: 'blocked' });
      }
    }
    const seq = (this._seqByRun.get(runId) || 0) + 1;
    this._seqByRun.set(runId, seq);
    try {
      if (typeof this.db.addRunEvent === 'function' && this.db.addRunEvent.length >= 4) {
        this.db.addRunEvent(runId, eventType, payload, seq);
      } else {
        this.db.addRunEvent(runId, eventType, payload);
      }
    } catch {}
    const eventId = `e_${runId}_${seq}`;
    const event = { runId, eventId, sequence: seq, type: eventType, payload };
    this.emit('event', event);
    if (this.harness) {
      if(['StepStarted','StepCompleted'].includes(eventType))this.harness.sessions.record(runId,{eventId,type:eventType==='StepStarted'?'step/start':'step/end',payload:{turnId:runId,step:payload.step,toolCalls:payload.toolCalls}});
      this.harness.ctx.emit('session/event', freezeValue(structuredClone(event)));
      if (['RunStarted','RunCompleted','RunFailed','RunAborted'].includes(eventType)) this.harness.ctx.emit('agent/status', Object.freeze({runId,type:eventType}));
    }
  }

  resolveModel(session, agent) {
    try {
      const override = this.db.getSessionModelOverride ? this.db.getSessionModelOverride(session.id) : null;
      if (override && override.providerId && override.modelId) return override;
    } catch {}
    const preset=this.harness?.profiles.selected(session.id);if(preset?.model)return preset.model;
    return { providerId: agent.model_provider, modelId: agent.model_name };
  }

  run(options) {
    if(this.deletingSessions?.has(options.sessionId))return Promise.reject(new Error('Chat is being deleted'));
    const task = (async () => {
      if (this.harness) {
        await this.harness.ready;
        if (this.harness.closed || this.harness.closing || this.harness.changingPlugins) throw new Error('Harness is stopping or changing plugins');
      }
      return this.harness ? this.harness.agents.execute(options) : this._run(options);
    })();
    this.pendingRuns.add(task);
    task.finally(() => {this.pendingRuns.delete(task);if(this.harness&&!this.harness.closing)this.pumpInbox(options.sessionId);}).catch(() => {});
    return task;
  }

  sendInboxNow(sessionId,id){
    const inbox=this.harness.inbox,item=inbox.get(id);
    if(!item||item.sessionId!==sessionId||item.status!=='queued')throw new Error('Message no longer pending');
    inbox.mutation(sessionId,'control/updated',()=>{
      const earliest=inbox.db.prepare("SELECT MIN(created_at) AS time FROM harness_inbox WHERE session_id=? AND status='queued'").get(sessionId).time;
      inbox.db.prepare("UPDATE harness_inbox SET kind='queued',target_run_id=NULL,created_at=? WHERE id=? AND status='queued'").run((earliest ?? Date.now())-1,id);
      return inbox.get(id);
    });
    const handle=[...this.harness.agents.handles.values()].find(h=>h.sessionId===sessionId&&h.runId);
    for(const active of this.activeRuns.values())if(active.sessionId===sessionId)active.superseded=true;
    for(const context of this.harness.runContexts.values())if(context.sessionId===sessionId)context.superseded=true;
    handle?.abort('User sent a new message immediately');
    for(const [runId,active] of this.activeRuns)if(active.sessionId===sessionId&&!active.abortController.signal.aborted)this.abortRun(runId,'User sent a new message immediately');
    // pumpInbox waits for session ownership/body drain; run.finally pumps again.
    this.pumpInbox(sessionId);
    return inbox.get(id);
  }

  pumpInbox(sessionId){
    if(this.deletingSessions?.has(sessionId)||!this.harness||this.harness.closing||this.harness.changingPlugins||this.harness.agents.sessionOwners.has(sessionId)||[...this.activeRuns.values()].some(r=>r.sessionId===sessionId))return;
    const next=this.harness.inbox.consume(sessionId,'queued',1)[0];if(!next)return;
    const runId=`run_queue_${next.id}`;
    this.run({runId,sessionId,prompt:next.content}).catch(error=>{if(!this.db.db.prepare('SELECT id FROM runs WHERE id=?').get(runId))this.harness.inbox.db.prepare("UPDATE harness_inbox SET status='queued' WHERE id=? AND status='claimed'").run(next.id);console.error('Queued run failed',error.message);});
  }

  async drain(reason = 'Daemon stopped') {
    for (const runId of this.activeRuns.keys()) this.abortRun(runId, reason);
    await Promise.allSettled([...this.pendingRuns]);
  }

  _run(options){return executeTurn(this,options);}

  buildSystemPrompt(agent, userPrompt = '', responseLanguage = 'auto', runTools = this.tools, scope = null) {
    return buildDefaultPrompt(this, agent, userPrompt, responseLanguage, runTools, scope);
  }
}
