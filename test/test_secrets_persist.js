import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SecretsVault } from '../server/providers/secrets.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
const v1 = new SecretsVault(dir);
const ref = v1.set('prov_1', 'sk-live-secret-123');
if (!ref) throw new Error('no ref');
// Simulate daemon restart: fresh instance, same dir
const v2 = new SecretsVault(dir);
if (v2.get(ref) !== 'sk-live-secret-123') throw new Error('secret lost across restart');
const raw = fs.readFileSync(path.join(dir, 'secrets.enc.json'), 'utf-8');
if (raw.includes('sk-live-secret-123')) throw new Error('secret stored in plaintext!');
// RAM-only mode (tests) must not touch disk
const v3 = new SecretsVault(null);
if (v3.file !== null) throw new Error('null dir must stay RAM-only');
console.log('secrets persist PASS');
fs.rmSync(dir, { recursive: true, force: true });
