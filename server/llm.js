import http from 'node:http';
import https from 'node:https';
import { ProviderOfflineError } from './providers/errors.js';

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

  async streamChat({ messages, tools = [], onChunk, onReasoning, onToolCall, signal }) {
    const health = await this.checkHealth();
    if (!health.available) {
      throw new ProviderOfflineError(health.error || 'Configured model API is unavailable', { code: 'UNREACHABLE' });
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

                const reasoning = choice.delta?.reasoning_content ?? choice.delta?.reasoning;
                if (typeof reasoning === 'string' && reasoning) onReasoning?.(reasoning);

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

}
