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

    this.emitEvent(runId, 'RunAborted', { runId, reason, timestamp: Date.now() });
    this.activeRuns.delete(runId);
    return true;
  }

  emitEvent(runId, eventType, payload) {
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
    // Session mới chưa chọn model: ưu tiên provider đang bật có model, đừng rớt về default chết (ollama offline).
    try {
      const all = this.db.getProviders ? this.db.getProviders() : [];
      const pool = all.some(p => p.enabled) ? all.filter(p => p.enabled) : all;
      for (const p of pool) {
        const models = (this.db.getModels ? this.db.getModels(p.id) : []).filter(m => m.enabled);
        if (models.length) return { providerId: p.id, modelId: models[0].model_id };
      }
    } catch {}
    return { providerId: agent.model_provider, modelId: agent.model_name };
  }

  async run({ runId, sessionId, prompt, responseLanguage = 'auto' }) {
    const session = this.db.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} không tồn tại`);

    const agent = this.db.getAgent(session.agent_id);
    if (!agent) throw new Error(`Agent ${session.agent_id} không tồn tại`);

    const abortController = new AbortController();
    this.activeRuns.set(runId, { abortController, sessionId });

    this.db.createRun(runId, sessionId);
    this.emitEvent(runId, 'RunStarted', { runId, sessionId, prompt, timestamp: Date.now() });

    // Save User message
    const userMsgId = 'msg_' + Math.random().toString(36).substring(2, 10);
    this.db.addMessage(userMsgId, sessionId, 'user', prompt);

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

      while (step < maxSteps) {
        step++;
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
              tools: availableTools,
              signal: abortController.signal,
              onChunk: opts.onChunk,
              onToolCall: opts.onToolCall
            });
          }
          return await this.llm.streamChat({
            messages,
            tools: availableTools,
            signal: abortController.signal,
            onChunk: opts.onChunk,
            onToolCall: opts.onToolCall
          });
        };

        await streamFn({
          messages,
          tools: availableTools,
          signal: abortController.signal,
          onChunk: (chunk) => {
            currentStepText += chunk;
            finalContent += chunk;
            this.emitEvent(runId, 'TextDelta', { runId, delta: chunk });
          },
          onToolCall: (tc) => {
            pendingToolCalls.push(tc);
          }
        });

        if (currentStepText) {
          messages.push({ role: 'assistant', content: currentStepText });
        }

        // If no tool call was made, we are done!
        if (pendingToolCalls.length === 0) {
          break;
        }

        // Process Tool Calls
        for (const tc of pendingToolCalls) {
          if (abortController.signal.aborted) break;

          const toolName = tc.name;
          const inputArgs = tc.arguments || {};
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
            messages.push({
              role: 'user',
              content: `[TOOL_ERROR]: ${blockedMsg}`
            });
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
              messages.push({
                role: 'user',
                content: `[TOOL_REJECTED]: ${userDeniedMsg}. Hãy chọn phương án khác hoặc giải thích cho người dùng.`
              });
              continue;
            }
          }

          // 3. Tool Execution
          const tool = this.tools.get(toolName);
          if (!tool) {
            messages.push({
              role: 'user',
              content: `[TOOL_ERROR]: Không tìm thấy công cụ "${toolName}"`
            });
            continue;
          }

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

      // 4. Save Assistant final response
      const agentMsgId = 'msg_' + Math.random().toString(36).substring(2, 10);
      this.db.addMessage(agentMsgId, sessionId, 'agent', finalContent || 'Đã hoàn thành tác vụ.');

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
          this.db.addMessage('msg_' + Math.random().toString(36).substring(2, 10), sessionId, 'agent', `Lỗi: ${err.message}`);
        } catch {}
        this.db.updateRunStatus(runId, 'failed', err.message);
        this.emitEvent(runId, 'RunFailed', { runId, error: err.message, timestamp: Date.now() });
      }
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  buildSystemPrompt(agent, userPrompt, responseLanguage = 'auto') {
    let prompt = agent.system_prompt + '\n\n';

    // 1. Memory Recall (Hermes-style FTS5 search)
    const recalledMemories = this.db.searchMemories(userPrompt, 4);
    if (recalledMemories.length > 0) {
      prompt += '## BỘ NHỚ ĐƯỢC HỒI TƯỞNG (RECALLED MEMORIES):\n';
      for (const m of recalledMemories) {
        prompt += `- [${m.category.toUpperCase()}]: ${m.content}\n`;
      }
      prompt += '\nHãy vận dụng các ký ức trên vào câu trả lời khi thích hợp.\n\n';
    }

    // 2. Active Skills (Agent Skills)
    const skills = this.skills.loadAllSkills();
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
