import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// RAM vault backed by an encrypted file so API keys survive daemon restarts.
// File: <dataDir>/secrets.enc.json (AES-256-GCM), key: <dataDir>/.vault.key.
// ponytail: file-key encryption, not OS keychain; migrate to keychain when Tauri shell exists.
export class SecretsVault {
  constructor(dataDir = null) {
    this.map = new Map();
    this.dataDir = dataDir;
    this.file = dataDir ? path.join(dataDir, 'secrets.enc.json') : null;
    this.keyFile = dataDir ? path.join(dataDir, '.vault.key') : null;
    this.key = null;
    if (dataDir) this.load();
  }

  ensureKey() {
    if (this.key) return this.key;
    try {
      if (fs.existsSync(this.keyFile)) {
        this.key = Buffer.from(fs.readFileSync(this.keyFile, 'utf-8').trim(), 'hex');
        if (this.key.length === 32) return this.key;
      }
    } catch {}
    this.key = crypto.randomBytes(32);
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(this.keyFile, this.key.toString('hex'), { mode: 0o600 });
    } catch {}
    return this.key;
  }

  load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const key = this.ensureKey();
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      for (const [ref, enc] of Object.entries(raw)) {
        try {
          const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'hex'));
          decipher.setAuthTag(Buffer.from(enc.tag, 'hex'));
          const plain = Buffer.concat([decipher.update(Buffer.from(enc.data, 'hex')), decipher.final()]).toString('utf-8');
          this.map.set(ref, plain);
        } catch {}
      }
    } catch {}
  }

  persist() {
    if (!this.file) return;
    try {
      const key = this.ensureKey();
      const raw = {};
      for (const [ref, secret] of this.map.entries()) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const data = Buffer.concat([cipher.update(secret, 'utf-8'), cipher.final()]);
        raw[ref] = { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('hex') };
      }
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(raw), { mode: 0o600 });
    } catch {}
  }

  set(providerId, secret) {
    if (!secret) return null;
    const ref = 'skref_' + Math.random().toString(36).substring(2, 10);
    this.map.set(ref, secret);
    this.persist();
    return ref;
  }

  get(ref) {
    if (!ref) return undefined;
    return this.map.get(ref);
  }

  has(ref) {
    return this.map.has(ref);
  }

  remove(ref) {
    if (!ref) return;
    this.map.delete(ref);
    this.persist();
  }

  removeByProvider() {}
}
