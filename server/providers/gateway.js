import { ModelNotFoundError, CapabilityError } from './errors.js';
import * as Ollama from './adapters/ollama.js';
import * as OpenAICompat from './adapters/openai-compatible.js';
import * as Anthropic from './adapters/anthropic.js';
import * as Google from './adapters/google.js';

export class Gateway {
  constructor(db, vault, registry) {
    this.db = db;
    this.vault = vault;
    this.registry = registry;
  }

  resolve(providerId, modelId) {
    let p = this.db.getProvider(providerId);
    if (!p) {
      const all = this.db.getProviders();
      p = all.find(x => x.type === providerId) || all.find(x => x.id === providerId);
    }
    if (!p) throw new ModelNotFoundError(modelId, { providerId });
    const m = this.db.getModels(p.id).find(x => x.model_id === modelId && x.enabled);
    if (!m) throw new ModelNotFoundError(modelId, { providerId });
    const apiKey = p.api_key_ref ? this.vault.get(p.api_key_ref) : undefined;
    return { provider: p, model: m, apiKey };
  }

  assertCapabilities(modelRow, needs = []) {
    let caps = {};
    try { caps = JSON.parse(modelRow.capabilities_json || '{}'); } catch {}
    for (const n of needs) if (!caps[n]) throw new CapabilityError(n, { providerId: modelRow.provider_id });
  }

  adapterFor(type, provider = null) {
    if (type === 'ollama') return Ollama;
    if (type === 'anthropic') return Anthropic;
    if (type === 'google') return Google;
    if (type === 'custom' && provider) {
      try {
        const cfg = JSON.parse(provider.config_json || '{}');
        if (cfg.requestFormat === 'ollama') return Ollama;
        if (cfg.requestFormat === 'anthropic') return Anthropic;
        if (cfg.requestFormat === 'google') return Google;
      } catch {}
    }
    return OpenAICompat;
  }

  async streamChat({ providerId, modelId, messages, tools = [], signal, onChunk, onReasoning, onToolCall }) {
    const { provider, model, apiKey } = this.resolve(providerId, modelId);
    this.assertCapabilities(model, tools.length ? ['tools'] : []);
    const ad = this.adapterFor(provider.type, provider);
    let cfg = {};
    try { cfg = JSON.parse(provider.config_json || '{}'); } catch {}
    const t0 = Date.now();
    const outcome = await ad.streamChat({
      baseURL: provider.base_url, apiKey, headers: cfg.headers || {}, timeoutMs: cfg.timeoutMs || 30000,
      model: model.model_id, messages, tools, signal, onChunk, onReasoning, onToolCall
    });
    return { ...(outcome || {}), latencyMs: Date.now() - t0 };
  }

  async testConnection(providerId) {
    const p = this.db.getProvider(providerId);
    if (!p) throw new Error('Provider not found');
    let cfg = {};
    try { cfg = JSON.parse(p.config_json || '{}'); } catch {}
    const apiKey = p.api_key_ref ? this.vault.get(p.api_key_ref) : undefined;
    const ad = this.adapterFor(p.type, p);
    const t0 = Date.now();
    try {
      const found = await ad.discoverModels({ baseURL: p.base_url, apiKey, headers: cfg.headers || {}, timeoutMs: cfg.timeoutMs || 5000 });
      return { connected: true, latencyMs: Date.now() - t0, modelsDiscovered: found.length, models: found };
    } catch (e) {
      return { connected: false, code: e.code || 'UNREACHABLE', message: e.message, latencyMs: Date.now() - t0 };
    }
  }
}
