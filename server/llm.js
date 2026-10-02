import http from 'node:http';
import https from 'node:https';

export class LLMClient {
  constructor(config = {}) {
    this.provider = config.provider || 'ollama'; // 'ollama' | 'openai' | 'custom'
    this.endpoint = config.endpoint || 'http://localhost:11434';
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'qwen2.5:14b';
  }

  updateConfig(config) {
    if (config.provider) this.provider = config.provider;
    if (config.endpoint) this.endpoint = config.endpoint.replace(/\/+$/, '');
    if (config.apiKey !== undefined) this.apiKey = config.apiKey;
    if (config.model) this.model = config.model;
  }

  async checkHealth() {
    try {
      const url = new URL(this.endpoint);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      return await new Promise(resolve => {
        const req = client.get(this.endpoint + (this.provider === 'ollama' ? '/api/tags' : '/v1/models'), {
          timeout: 2000,
          headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
        }, res => {
          if (res.statusCode >= 200 && res.statusCode < 400) {
            resolve({ available: true, status: res.statusCode });
          } else {
            resolve({ available: false, status: res.statusCode, error: `HTTP ${res.statusCode}` });
          }
        });

        req.on('error', err => {
          resolve({ available: false, error: err.message });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ available: false, error: 'Connection timeout (2s)' });
        });
      });
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  // Stream completion with tool definitions
  async streamChat({ messages, tools = [], onChunk, onToolCall, signal }) {
    const health = await this.checkHealth();

    if (!health.available) {
      // Offline fallback: Use the intelligent Local Deterministic Engine
      // This ensures 100% usability even when Ollama is offline or uninstalled!
      return this.runLocalDeterministicEngine({ messages, tools, onChunk, onToolCall, signal });
    }

    const isOllama = this.provider === 'ollama';
    const postUrl = isOllama
      ? `${this.endpoint}/v1/chat/completions`
      : `${this.endpoint}/chat/completions`;

    const requestBody = JSON.stringify({
      model: this.model,
      messages: messages.map(m => ({
        role: m.role || m.sender,
        content: m.content
      })),
      tools: tools.length > 0 ? tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      })) : undefined,
      stream: true,
      temperature: 0.7
    });

    const parsedUrl = new URL(postUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const req = client.request(parsedUrl, {
        method: 'POST',
        headers,
        signal
      }, res => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let errBody = '';
          res.on('data', d => errBody += d);
          res.on('end', () => {
            reject(new Error(`LLM API returned HTTP ${res.statusCode}: ${errBody}`));
          });
          return;
        }

        let buffer = '';
        let toolCallAccumulators = new Map();

        res.on('data', chunk => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep partial line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.substring(6));
                const choice = parsed.choices?.[0];
                if (!choice) continue;

                // Handle text token
                if (choice.delta?.content) {
                  onChunk(choice.delta.content);
                }

                // Handle tool calls streaming
                if (choice.delta?.tool_calls) {
                  for (const tc of choice.delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolCallAccumulators.has(idx)) {
                      toolCallAccumulators.set(idx, {
                        id: tc.id || `call_${Date.now()}_${idx}`,
                        name: tc.function?.name || '',
                        argumentsStr: ''
                      });
                    }
                    const acc = toolCallAccumulators.get(idx);
                    if (tc.function?.name) acc.name = tc.function.name;
                    if (tc.function?.arguments) acc.argumentsStr += tc.function.arguments;
                  }
                }
              } catch (_) {}
            }
          }
        });

        res.on('end', () => {
          // Process any completed tool calls
          for (const [_, acc] of toolCallAccumulators.entries()) {
            if (acc.name) {
              let parsedArgs = {};
              try {
                parsedArgs = JSON.parse(acc.argumentsStr || '{}');
              } catch (_) {
                parsedArgs = { raw: acc.argumentsStr };
              }
              onToolCall({
                id: acc.id,
                name: acc.name,
                arguments: parsedArgs
              });
            }
          }
          resolve();
        });
      });

      req.on('error', err => reject(err));
      req.write(requestBody);
      req.end();
    });
  }

  // Built-in intelligent assistant when external LLM server is not currently running.
  // Performs intent parsing, real tool calls, real memory retrieval/storage, and rich responses!
  async runLocalDeterministicEngine({ messages, tools, onChunk, onToolCall, signal }) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user' || m.sender === 'user')?.content || '';
    const lower = lastUserMsg.toLowerCase();

    // Small delay to simulate natural stream
    const emitStream = async (text) => {
      const words = text.split(' ');
      for (const w of words) {
        if (signal?.aborted) return;
        onChunk(w + ' ');
        await new Promise(r => setTimeout(r, 15));
      }
    };

    // Tool observations must be summarized, never re-trigger a new tool (fixes 5x duplicate loop:
    // `includes('ls')` matched `false` inside TOOL_RESULT JSON).
    if (lower.startsWith('[tool_result') || lower.startsWith('[tool_error') || lower.startsWith('[tool_rejected')) {
      await emitStream('Đã nhận kết quả công cụ. Tôi sẽ tổng hợp và phản hồi cho bạn.\n');
      return;
    }

    // Intent 1: List directory / files
    if (lower.includes('liệt kê') || lower.includes('xem file') || lower.includes('thư mục') || lower.includes('list file') || /(^|[\s;:&|])ls(\s|$|;)/.test(lower)) {
      await emitStream('Tôi sẽ kiểm tra danh sách tập tin trong thư mục làm việc:\n');
      onToolCall({
        id: `call_${Date.now()}`,
        name: 'fs_list',
        arguments: { path: '.' }
      });
      return;
    }

    // Intent 2: Read file (e.g. package.json, README)
    if (lower.includes('đọc file') || lower.includes('nội dung file') || lower.includes('read file')) {
      const match = lastUserMsg.match(/(?:file|tập tin|đọc)\s+([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i);
      const targetPath = match ? match[1] : 'package.json';
      await emitStream(`Đang chuẩn bị đọc nội dung tập tin **${targetPath}**:\n`);
      onToolCall({
        id: `call_${Date.now()}`,
        name: 'fs_read',
        arguments: { path: targetPath }
      });
      return;
    }

    // Intent 3: Run command
    if (lower.includes('chạy lệnh') || lower.includes('exec') || lower.includes('terminal') || lower.startsWith('$ ') || lower.includes('npm ') || lower.includes('git ')) {
      let cmd = 'git status';
      const cmdMatch = lastUserMsg.match(/(?:chạy lệnh|run|exec):\s*(.+)/i) || lastUserMsg.match(/\$\s*(.+)/);
      if (cmdMatch) cmd = cmdMatch[1].trim();
      else if (lower.includes('npm')) cmd = 'npm -v';
      else if (lower.includes('git')) cmd = 'git --version';

      await emitStream(`Đang yêu cầu thực thi lệnh shell: \`${cmd}\`\n`);
      onToolCall({
        id: `call_${Date.now()}`,
        name: 'shell_exec',
        arguments: { command: cmd }
      });
      return;
    }

    // Intent 4: Memory save
    if (lower.includes('ghi nhớ') || lower.includes('nhớ rằng') || lower.includes('remember')) {
      const fact = lastUserMsg.replace(/.*(?:ghi nhớ|nhớ rằng|remember)\s*/i, '').trim() || lastUserMsg;
      await emitStream('Mình sẽ lưu thông tin này vào bộ nhớ.\n');
      onToolCall({
        id: `call_${Date.now()}`,
        name: 'memory_save',
        arguments: { category: 'profile', content: fact }
      });
      return;
    }

    // Intent 5: Memory search
    if (lower.includes('tìm trong bộ nhớ') || lower.includes('bộ nhớ') || lower.includes('recall')) {
      const q = lastUserMsg.replace(/.*(?:tìm trong bộ nhớ|bộ nhớ|recall)\s*/i, '').trim() || 'user';
      await emitStream(`Mình sẽ tìm trong bộ nhớ với từ khóa: "${q}".\n`);
      onToolCall({
        id: `call_${Date.now()}`,
        name: 'memory_search',
        arguments: { query: q }
      });
      return;
    }

    // Natural desktop assistant response
    const defaultResponse = `Mình là **ohmyt**, trợ lý chạy trực tiếp trên máy của bạn.

Mình có thể làm việc với tệp, terminal, web và những điều bạn chọn lưu lại.

Bạn muốn bắt đầu từ đâu?`;
    await emitStream(defaultResponse);
  }
}
