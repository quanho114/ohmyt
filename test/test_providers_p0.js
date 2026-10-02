import { AppDatabase } from '../server/db.js';
const db = new AppDatabase(':memory:');
const p = db.createProvider({ name: 'My Local Server', type: 'openai-compatible', base_url: 'http://localhost:1234', api_key_ref: null, config_json: '{}' });
console.assert(p.id && p.name === 'My Local Server', 'createProvider failed');
const m = db.createModel({ provider_id: p.id, model_id: 'my-custom-model', display_name: 'My Custom', capabilities_json: JSON.stringify({chat:true,streaming:true,tools:false,vision:false,reasoning:false,json:false,embeddings:false}) });
console.assert(m.model_id === 'my-custom-model', 'createModel failed');
const list = db.getModels(p.id);
console.assert(list.length === 1, 'getModels failed');
console.log('Task1 DB registry PASS');

import { ProviderOfflineError, AuthenticationError, ModelNotFoundError, CapabilityError } from '../server/providers/errors.js';
import { SecretsVault } from '../server/providers/secrets.js';
console.assert(new ProviderOfflineError('x').code === 'UNREACHABLE', 'offline code');
const v = new SecretsVault();
const ref = v.set('prov_1', 'sk-secret');
console.assert(v.get(ref) === 'sk-secret', 'vault get');
console.assert(!JSON.stringify({ ref }).includes('sk-secret'), 'ref must not contain secret');
console.log('Task2 errors+secrets PASS');

import { ProviderRegistry } from '../server/providers/registry.js';
const reg = new ProviderRegistry(db, v);
console.assert(reg.normalizeBaseURL('http://host:1234/') === 'http://host:1234', 'trailing slash');
console.assert(reg.normalizeBaseURL('http://localhost:20128/v1') === 'http://localhost:20128', 'strip /v1 (9router style)');
console.assert(reg.normalizeBaseURL('http://localhost:20128/v1/') === 'http://localhost:20128', 'strip /v1/ with slash');
console.assert(reg.normalizeBaseURL('http://x/api') === 'http://x/api', 'keep non-v1 path');
console.assert(reg.normalizeBaseURL('http://x/v10') === 'http://x/v10', 'keep v10');
const cp = reg.createProvider({ name: 'T', type: 'openai-compatible', baseURL: 'http://x:1234/', apiKey: '' });
console.assert(cp.base_url === 'http://x:1234' && !cp.api_key_ref, 'empty key must not create ref');
console.log('Task3 registry PASS');

import { Gateway } from '../server/providers/gateway.js';
const gw = new Gateway(db, v);
console.assert(typeof gw.assertCapabilities === 'function', 'gateway fn');
try { gw.assertCapabilities({ capabilities_json: JSON.stringify({ tools: false }) }, ['tools']); console.assert(false, 'must throw'); }
catch (e) { console.assert(e.name === 'CapabilityError', 'capability'); }
console.log('Task6 gateway PASS');
