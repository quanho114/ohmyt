import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export const MAX_BROWSER_FILE = 25 * 1024 * 1024;
const QUOTA = 100 * 1024 * 1024;
export class BrowserFiles {
  constructor(db, root) {
    this.db = db; this.root = path.resolve(root);
    db.db.exec(`CREATE TABLE IF NOT EXISTS browser_files (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, name TEXT NOT NULL,
      mime TEXT NOT NULL, kind TEXT NOT NULL, bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL, created_at INTEGER NOT NULL)`);
  }
  name(name) {
    if (typeof name !== 'string' || name.length > 200) throw new Error('Tên file không hợp lệ.');
    const base = path.basename(name.replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f]/g, '_');
    return !base || ['.', '..'].includes(base) ? 'file' : base;
  }
  session(sessionId) {
    const session = this.db.getSession(sessionId);
    if (!session || session.project_id) throw new Error('File trình duyệt chỉ dùng trong chat độc lập.');
  }
  metadata(row) {
    return { fileId: row.id, name: row.name, mime: row.mime, kind: row.kind, bytes: row.bytes, sha256: row.sha256, createdAt: row.created_at };
  }
  list(sessionId) {
    this.session(sessionId);
    return this.db.db.prepare('SELECT * FROM browser_files WHERE session_id=? ORDER BY created_at DESC').all(sessionId).map(row => this.metadata(row));
  }
  async stage(sessionId) {
    this.session(sessionId);
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const id = randomUUID();
    return { id, path: path.join(this.root, id + '.part') };
  }
  async commit(sessionId, stage, { name, mime = 'application/octet-stream', kind = 'download' }) {
    this.session(sessionId);
    name = this.name(name);
    if (!['upload', 'download', 'pdf', 'extraction', 'screenshot'].includes(kind) || !/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(mime)) throw new Error('File metadata không hợp lệ.');
    if (stage.path !== path.join(this.root, stage.id + '.part')) throw new Error('Invalid artifact staging path.');
    const stagedStat = await fs.lstat(stage.path);
    if (!stagedStat.isFile() || !stagedStat.size || stagedStat.size > MAX_BROWSER_FILE) throw new Error('File staging không hợp lệ hoặc vượt 25 MB.');
    const bytes = await fs.readFile(stage.path);
    if (!bytes.length || bytes.length > MAX_BROWSER_FILE) throw new Error('File phải nhỏ hơn hoặc bằng 25 MB và không rỗng.');
    if(kind==='screenshot'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Screenshot is not PNG.');
    if (kind === 'pdf' && bytes.toString('ascii', 0, 5) !== '%PDF-') throw new Error('Kết quả không phải PDF.');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const row = { id: stage.id, session_id: sessionId, name, mime, kind, bytes: bytes.length, sha256, created_at: Date.now() };
    const destination = path.join(this.root, stage.id);
    try {
      await fs.mkdir(destination, { mode: 0o700 });
      await fs.rename(stage.path, path.join(destination, name));
      await fs.chmod(path.join(destination, name), 0o600);
      this.session(sessionId);
      const usage = this.db.db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(bytes),0) AS bytes FROM browser_files WHERE session_id=?').get(sessionId);
      if (usage.count >= 50 || usage.bytes + bytes.length > QUOTA) throw new Error('Chat đạt giới hạn 50 file hoặc 100 MB. Xóa file cũ rồi thử lại.');
      this.db.db.prepare('INSERT INTO browser_files VALUES (?,?,?,?,?,?,?,?)').run(...Object.values(row)); }
    catch (error) { await fs.rm(destination, { recursive: true, force: true }); throw error; }
    return this.metadata(row);
  }
  async add(sessionId, name, bytes, mime = 'application/octet-stream', kind = 'upload') {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BROWSER_FILE) throw new Error('File phải nhỏ hơn hoặc bằng 25 MB và không rỗng.');
    const stage = await this.stage(sessionId);
    try { await fs.writeFile(stage.path, bytes, { flag: 'wx', mode: 0o600 }); return await this.commit(sessionId, stage, { name, mime, kind }); }
    finally { await this.discard(stage); }
  }
  async read(sessionId, fileId) {
    this.session(sessionId);
    const row = this.db.db.prepare('SELECT * FROM browser_files WHERE session_id=? AND id=?').get(sessionId, fileId);
    if (!row) throw new Error('File không thuộc chat này hoặc đã bị xóa.');
    const handle = await fs.open(path.join(this.root, row.id, row.name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== row.bytes || stat.size > MAX_BROWSER_FILE) throw new Error('File đã thay đổi.');
      const bytes = await handle.readFile();
      if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new Error('File đã thay đổi.');
      return { metadata: this.metadata(row), bytes };
    } finally { await handle.close(); }
  }
  async uploadPath(sessionId, fileId) {
    const { metadata } = await this.read(sessionId, fileId);
    return { metadata, filePath: path.join(this.root, metadata.fileId, metadata.name) };
  }
  async remove(sessionId, fileId) {
    this.session(sessionId);
    const row = this.db.db.prepare('SELECT id FROM browser_files WHERE session_id=? AND id=?').get(sessionId, fileId);
    if (!row) throw new Error('File không thuộc chat này hoặc đã bị xóa.');
    await fs.rm(path.join(this.root, row.id), { recursive: true, force: true });
    this.db.db.prepare('DELETE FROM browser_files WHERE id=? AND session_id=?').run(fileId, sessionId);
  }
  async discard(stage) { await fs.rm(stage.path, { force: true }).catch(() => {}); }
}
