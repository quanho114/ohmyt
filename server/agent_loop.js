import { canAutoTitle, hasTopic, fallbackTitle, generateTitle } from './session_titles.js';
import { EventEmitter } from 'node:events';

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
  }

  abortRun(runId, reason = 'Người dùng kích hoạt Take Control') {
    const active = this.activeRuns.get(runId);
    if (!active) return false;

    active.abortController.abort();
    this.tools.killProcessesForRun(runId);
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
    this.emit('event', { runId, eventId, sequence: seq, type: eventType, payload });
  }

  resolveModel(session, agent) {
    try {
      const override = this.db.getSessionModelOverride ? this.db.getSessionModelOverride(session.id) : null;
      if (override && override.providerId && override.modelId) return override;
    } catch {}
    return { providerId: agent.model_provider, modelId: agent.model_name };
  }

  async run({ runId, sessionId, prompt, responseLanguage = 'auto' }) {
    const session = this.db.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} không tồn tại`);

    const agent = this.db.getAgent(session.agent_id);
    if (!agent) throw new Error(`Agent ${session.agent_id} không tồn tại`);

    const abortController = new AbortController();
    const activity = { runId, reasoning: '', tools: [], startedAt: Date.now() };
    this.activeRuns.set(runId, { abortController, sessionId, activity });

    this.db.createRun(runId, sessionId);
    this.emitEvent(runId, 'RunStarted', { runId, sessionId, prompt, timestamp: Date.now() });

    // Save User message
    const userMsgId = 'msg_' + Math.random().toString(36).substring(2, 10);
    this.db.addMessage(userMsgId, sessionId, 'user', prompt);

    let failureExplanation = '';
    let titleTask = Promise.resolve();
    if (typeof this.db.updateAutoTitle === 'function' && canAutoTitle(session, this.db.getMessages(sessionId).filter(m => m.id !== userMsgId))) {
      const history = this.db.getMessages(sessionId);
      const fallback = fallbackTitle(history);
      const named = fallback && this.db.updateAutoTitle(sessionId, session.title, fallback);
      if (named) {
        this.emitEvent(runId, 'SessionTitleUpdated', { sessionId, title: named.title });
        titleTask = generateTitle({ gateway: this.gateway, llm: this.llm, model: this.resolveModel(session, agent), history, signal: abortController.signal }).then(title => {
          if (abortController.signal.aborted) return;
          const updated = this.db.updateAutoTitle(sessionId, named.title, title || named.title, true);
          if (updated) this.emitEvent(runId, 'SessionTitleUpdated', { sessionId, title: updated.title });
        }).catch(() => {});
      }
    }

    try {
      // 1. Context Assembly
      const systemPrompt = this.buildSystemPrompt(agent, prompt, responseLanguage);
      const conversationHistory = this.db.getMessages(sessionId).slice(-10);

      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(m => ({
          role: m.sender === 'agent' ? 'assistant' : m.sender,
          content: m.content
        }))
      ];
      const availableTools = this.tools.getAllDefinitions();
      let step = 0;
      const maxSteps = 5;
      let finalContent = '';
      let lastPendingToolCalls = [];
      let hasDeniedTool = false;
      let deniedReason = '';
      let unresolvedToolFailure = null;

      while (step <= maxSteps) {
        step++;
        const finalTurn = step > maxSteps;
        const turnTools = finalTurn ? [] : availableTools;
        if (finalTurn) messages.push({ role: 'system', content: 'Tool budget exhausted. Do not call any more tools. Give a concise final answer using the observed tool results. If information is unavailable or commands failed, explain exactly what could not be verified and why. Never invent a value or claim an action succeeded without evidence.' });
        if (abortController.signal.aborted) {
          throw new Error('Run bị hủy bởi người dùng');
        }

        let pendingToolCalls = [];
        let currentStepText = '';

        const selected = this.resolveModel(session, agent);
        const streamFn = async (opts) => {
          // Lỗi API báo thẳng ra chat (RunFailed), không fallback câm sang câu trả lời mẫu.
          if (this.gateway) {
            return await this.gateway.streamChat({
              providerId: selected.providerId,
              modelId: selected.modelId,
              messages,
              tools: turnTools,
              signal: abortController.signal,
              onChunk: opts.onChunk,
              onReasoning: opts.onReasoning,
              onToolCall: opts.onToolCall
            });
          }
          return await this.llm.streamChat({
            messages,
            tools: turnTools,
            signal: abortController.signal,
            onChunk: opts.onChunk,
              onReasoning: opts.onReasoning,
            onToolCall: opts.onToolCall
          });
        };

        const turnOutcome = await streamFn({
          messages,
          tools: turnTools,
          signal: abortController.signal,
          onChunk: (chunk) => {
            currentStepText += chunk;
            finalContent += chunk;
            this.emitEvent(runId, 'TextDelta', { runId, delta: chunk });
          },
          onReasoning: (delta) => {
            this.emitEvent(runId, 'ReasoningDelta', { runId, delta });
          },
          onToolCall: (tc) => pendingToolCalls.push(tc)
        });
        if (!turnOutcome || turnOutcome.completed !== true) {
          throw new Error('Provider ended without a verified completion signal');
        }
        if (finalTurn) {
          failureExplanation = currentStepText.trim();
          if (pendingToolCalls.length) throw new Error('Model vẫn yêu cầu công cụ sau lượt kết luận');
        }
        lastPendingToolCalls = pendingToolCalls;

        if (currentStepText) messages.push({ role: 'assistant', content: currentStepText });

        if (pendingToolCalls.length === 0) {
          if (unresolvedToolFailure && currentStepText.trim()) failureExplanation = currentStepText.trim();
          lastPendingToolCalls = [];
          break;
        }
        const validatedCalls = pendingToolCalls.map(tc => ({
          tc,
          ...this.tools.validateCall(tc)
        }));
        for (const validated of validatedCalls) {
          const { tc, tool, arguments: inputArgs } = validated;
          if (abortController.signal.aborted) break;
          const toolName = tc.name;
          const target = inputArgs.path || inputArgs.command || inputArgs.query || inputArgs.content || '';

          // 1b. Execution policy guard (P1 minimal)
          try {
            let policy = 'LOCAL_ONLY';
            try {
              const raw = agent.policy_json || agent.policy;
              if (raw) {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                policy = parsed.execution || parsed.policy || policy;
              }
            } catch {}
            if (policy === 'LOCAL_ONLY' && (toolName.startsWith('web_') || toolName.startsWith('browser_'))) {
              const blockedMsg = `Chính sách LOCAL_ONLY chặn công cụ mạng "${toolName}"`;
              this.emitEvent(runId, 'ToolCallBlocked', { runId, toolName, target, reason: blockedMsg });
              unresolvedToolFailure ||= blockedMsg;
              messages.push({ role: 'user', content: `[TOOL_ERROR]: ${blockedMsg}` });
              continue;
            }
          } catch {}

          // 2. Permission Evaluation
          const evaluation = this.permissions.evaluate(toolName, target);

          if (evaluation.action === 'DENY') {
            const blockedMsg = `Chính sách hệ thống từ chối thực thi công cụ "${toolName}" với mục tiêu: "${target}" (Policy: ${evaluation.matchedPolicy})`;
            this.emitEvent(runId, 'ToolCallBlocked', {
              runId,
              toolName,
              target,
              reason: blockedMsg
            });
            hasDeniedTool = true;
            deniedReason = blockedMsg;
            unresolvedToolFailure ||= blockedMsg;
            messages.push({ role: 'user', content: `[TOOL_ERROR]: ${blockedMsg}` });
            continue;
          }

          if (evaluation.action === 'ASK') {
            const description = `Agent yêu cầu thực thi công cụ "${toolName}" trên "${target}"`;
            const { requestId, promise } = this.permissions.requestApproval({
              runId,
              toolName,
              target,
              input: inputArgs,
              description
            });

            this.emitEvent(runId, 'PermissionRequired', {
              runId,
              requestId,
              toolName,
              target,
              input: inputArgs,
              description
            });

            // Update run status in DB
            this.db.updateRunStatus(runId, 'waiting_approval');

            let approved = false;
            try {
              const res = await promise;
              approved = res.allowed;
            } catch (err) {
              approved = false;
            }

            this.db.updateRunStatus(runId, 'running');

            if (!approved) {
              const userDeniedMsg = `Người dùng đã từ chối cấp quyền thực thi công cụ "${toolName}" (${target})`;
              this.emitEvent(runId, 'PermissionDenied', { runId, toolName, target, requestId });
              unresolvedToolFailure ||= userDeniedMsg;
              messages.push({
                role: 'user',
                content: `[TOOL_REJECTED]: ${userDeniedMsg}. Hãy chọn phương án khác hoặc giải thích cho người dùng.`
              });
              continue;
            }
          }

          // 3. Tool Execution

          this.emitEvent(runId, 'ToolCallStarted', {
            runId,
            toolId: tc.id,
            toolName,
            input: inputArgs,
            timestamp: Date.now()
          });

          const startTime = Date.now();
          let output;
          let isSuccess = true;

          try {
            output = await tool.execute(inputArgs, { runId, agentId: agent.id });
          } catch (err) {
            isSuccess = false;
            output = { error: err.message };
          }
          if (output && typeof output === 'object' && output.success === false) isSuccess = false;
          if (!isSuccess) unresolvedToolFailure ||= output?.error || `Công cụ "${toolName}" thất bại${Number.isInteger(output?.exitCode) ? ` (exit ${output.exitCode})` : ''}`;

          const durationMs = Date.now() - startTime;

          this.emitEvent(runId, 'ToolCallCompleted', {
            runId,
            toolId: tc.id,
            toolName,
            output,
            success: isSuccess,
            durationMs,
            timestamp: Date.now()
          });

          if (!isSuccess) unresolvedToolFailure ||= output?.error || `Công cụ "${toolName}" thất bại`;
          // Special notification if memory updated
          if (toolName === 'memory_save' && isSuccess) {
            this.emitEvent(runId, 'MemoryUpdated', {
              runId,
              category: inputArgs.category || 'profile',
              content: inputArgs.content
            });
          }

          // Add tool result as user/tool observation in context
          const toolResultStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
          messages.push({
            role: 'user',
            content: `[TOOL_RESULT for ${toolName}]:\n${toolResultStr}\nHãy tổng hợp kết quả này và phản hồi rõ ràng cho người dùng.`
          });
        }
      }

      if (lastPendingToolCalls.length > 0) {
        throw new Error('Đã đạt giới hạn số lượt gọi công cụ (5 lượt) mà chưa có phản hồi cuối cùng');
      }

      if (hasDeniedTool) {
        throw new Error(deniedReason || 'Hành động yêu cầu bị chính sách từ chối');
      }
      const completedWithWarnings = Boolean(unresolvedToolFailure && finalContent.trim() && activity.tools.some(tool => tool.status === 'completed') && !activity.tools.some(tool => tool.status === 'blocked'));
      if (unresolvedToolFailure && !completedWithWarnings) {
        throw new Error(`Required tool action did not complete: ${unresolvedToolFailure}`);
      }

      if (abortController.signal.aborted) return;

      await titleTask;
      if (abortController.signal.aborted) return;

      // 4. Save Assistant final response
      const agentMsgId = 'msg_' + Math.random().toString(36).substring(2, 10);
      this.db.addMessage(agentMsgId, sessionId, 'agent', finalContent || 'Đã hoàn thành tác vụ.', { activity: { ...activity, durationMs: Date.now() - activity.startedAt, status: completedWithWarnings ? 'warnings' : 'completed' } });

      this.db.updateRunStatus(runId, 'completed');
      this.emitEvent(runId, 'RunCompleted', {
        runId,
        sessionId,
        summary: 'Tác vụ hoàn thành thành công',
        timestamp: Date.now()
      });
    } catch (err) {
      if (!abortController.signal.aborted) {
        try {
          this.db.addMessage('msg_' + Math.random().toString(36).substring(2, 10), sessionId, 'agent', failureExplanation || `Lỗi: ${err.message}`, { activity: { ...activity, durationMs: Date.now() - activity.startedAt, status: 'error' } });
        } catch {}
        this.db.updateRunStatus(runId, 'failed', err.message);
        this.emitEvent(runId, 'RunFailed', { runId, error: err.message, timestamp: Date.now() });
      }
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  buildSystemPrompt(agent, userPrompt = '', responseLanguage = 'auto') {
    let prompt = (typeof agent === 'object' && agent !== null ? (agent.system_prompt || '') : String(agent || '')) + '\n\n';

    if (typeof this.tools?.describeRuntime === 'function') prompt += '## ACTUAL EXECUTION ENVIRONMENT\n' + JSON.stringify(this.tools.describeRuntime()) + '\nDo not assume the UI device and tool execution machine are the same. Use only advertised execution modes. Host operations follow permission policies.\n\n';

    // 1. Memory Recall (Hermes-style FTS5 search)
    const memoryScope = typeof agent === 'object' && agent !== null ? agent.id : null;
    const recalledMemories = (this.db && typeof this.db.searchMemories === 'function' && userPrompt)
      ? this.db.searchMemories(userPrompt, 4, memoryScope)
      : [];
    if (recalledMemories.length > 0) {
      prompt += '## BỘ NHỚ ĐƯỢC HỒI TƯỞNG (RECALLED MEMORIES):\n';
      for (const m of recalledMemories) {
        prompt += `- [${m.category.toUpperCase()}]: ${m.content}\n`;
      }
      prompt += '\nHãy vận dụng các ký ức trên vào câu trả lời khi thích hợp.\n\n';
    }

    // 2. Active Skills (Agent Skills)
    const skills = (this.skills && typeof this.skills.loadAllSkills === 'function')
      ? this.skills.loadAllSkills().filter(s => s.enabled !== false)
      : [];
    if (skills.length > 0) {
      prompt += '## CÁC KỸ NĂNG KHẢ DỤNG (ACTIVE SKILLS):\n';
      for (const s of skills) {
        prompt += `### Kỹ năng: ${s.name} (v${s.version})\n${s.description}\n${s.instructions}\n\n`;
      }
    }

    prompt += `## QUY TẮC BẢO MẬT & THỰC THI:
- Khi cần thao tác tệp, sử dụng fs_read, fs_write, fs_list.
- Khi cần chạy lệnh terminal, sử dụng shell_exec.
- Khi cần ghi nhớ đặc điểm người dùng, dùng memory_save.
- Luôn giải thích trước khi gọi công cụ sửa đổi hoặc lệnh shell.`;
    if (responseLanguage === 'en') prompt += '\n\n## RESPONSE LANGUAGE\nReply in English.';
    if (responseLanguage === 'vi') prompt += '\n\n## RESPONSE LANGUAGE\nTrả lời bằng tiếng Việt.';

    return prompt;
  }
}
