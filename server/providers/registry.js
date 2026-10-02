export class ProviderRegistry {
  constructor(db, vault) {
    this.db = db;
    this.vault = vault;
  }

  normalizeBaseURL(u) {
    // Strip trailing slashes, then a trailing /v1 (LobeHub-style URLs like
    // http://host:port/v1), then slashes again. Adapters always append /v1/...
    return String(u || '').trim().replace(/\/+$/, '').replace(/\/v1$/i, '').replace(/\/+$/, '');
  }

  listProviders() {
    const ps = this.db.getProviders();
    return ps.map(p => ({ ...p, models: this.db.getModels(p.id) }));
  }

  createProvider({ id, name, type, baseURL, apiKey, config = {} }) {
    const base_url = this.normalizeBaseURL(baseURL);
    if (id && !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error('ID nhà cung cấp chỉ gồm chữ thường, số và gạch ngang (vd: my-provider).');
    }
    const rec = this.db.createProvider({ id: id || undefined, name, type, base_url, api_key_ref: null, config_json: JSON.stringify(config) });
    if (apiKey) {
      const ref = this.vault.set(rec.id, apiKey);
      this.db.updateProvider(rec.id, { api_key_ref: ref });
      this.db.db.prepare(`INSERT OR IGNORE INTO secrets_metadata (key_ref,provider_id,created_at) VALUES (?,?,?)`).run(ref, rec.id, Date.now());
      return this.db.getProvider(rec.id);
    }
    return rec;
  }

  updateProvider(id, { name, type, baseURL, apiKey, config, enabled }) {
    const cur = this.db.getProvider(id);
    if (!cur) throw new Error('Provider not found');
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (type !== undefined) patch.type = type;
    if (baseURL !== undefined) patch.base_url = this.normalizeBaseURL(baseURL);
    if (config !== undefined) patch.config_json = typeof config === 'string' ? config : JSON.stringify(config);
    if (enabled !== undefined) patch.enabled = enabled ? 1 : 0;
    if (apiKey !== undefined) {
      if (apiKey) {
        const ref = this.vault.set(id, apiKey);
        patch.api_key_ref = ref;
        this.db.db.prepare(`INSERT OR IGNORE INTO secrets_metadata (key_ref,provider_id,created_at) VALUES (?,?,?)`).run(ref, id, Date.now());
        // Xóa ref cũ để khỏi rò rỉ secret + metadata sau mỗi lần lưu key.
        if (cur.api_key_ref && cur.api_key_ref !== ref) {
          this.vault.remove(cur.api_key_ref);
          try { this.db.db.prepare(`DELETE FROM secrets_metadata WHERE key_ref=?`).run(cur.api_key_ref); } catch {}
        }
      } else {
        if (cur.api_key_ref) {
          this.vault.remove(cur.api_key_ref);
          try { this.db.db.prepare(`DELETE FROM secrets_metadata WHERE key_ref=?`).run(cur.api_key_ref); } catch {}
        }
        patch.api_key_ref = null;
      }
    }
    return this.db.updateProvider(id, patch);
  }

  listModels(providerId) {
    return this.db.getModels(providerId);
  }

  addModel(providerId, { modelId, displayName, capabilities = {}, contextWindow = null, maxOutputTokens = null }) {
    return this.db.createModel({
      provider_id: providerId,
      model_id: modelId,
      display_name: displayName || modelId,
      capabilities_json: JSON.stringify({ chat: true, streaming: true, tools: false, vision: false, reasoning: false, json: false, embeddings: false, ...capabilities }),
      context_window: contextWindow,
      max_output_tokens: maxOutputTokens
    });
  }
}
