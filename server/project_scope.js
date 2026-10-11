import fs from 'node:fs';
import path from 'node:path';

export function rootIdentity(root) {
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) throw new Error('Project root is not a directory');
  return `${stat.dev}:${stat.ino}`;
}
export function overlaps(a, b) {
  const inside = (root, candidate) => { const rel = path.relative(root, candidate); return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };
  return inside(a, b) || inside(b, a);
}
export function assertProjectRoot(db, project) {
  if (!project || !project.root_identity || fs.realpathSync(project.path) !== project.path || rootIdentity(project.path) !== project.root_identity) throw new Error('Thư mục project đã thay đổi. Chọn lại thư mục để tiếp tục.');
  for (const other of db.getProjects(true)) if (other.id !== project.id && overlaps(project.path, other.path)) throw new Error('Project có thư mục trùng hoặc lồng trong project khác.');
  if (db.dbPath !== ':memory:' && overlaps(project.path, path.dirname(path.resolve(db.dbPath)))) throw new Error('Project không được chứa hoặc nằm trong thư mục dữ liệu ohmyt.');
}
export function createRunScope(db, session, runId) {
  const project = session.project_id ? db.getProject(session.project_id) : null;
  if (session.project_id) assertProjectRoot(db, project);
  return Object.freeze({runId, sessionId: session.id, agentId: session.agent_id, projectId: session.project_id || null,
    scopeId: project ? `project:${project.id}` : `standalone:${session.id}`, canonicalRoot: project?.path, rootIdentity: project?.root_identity, approvalMode: session.approval_mode || 'ask', policyVersion: 1});
}
export function isSecretPath(relative) {
  if (/(?:^|[\\/])\.git[\\/]config$/i.test(relative)) return true;
  return relative.split(/[\\/]/).some(part => /^(?:\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|\.npmrc|\.pypirc|credentials(?:\.json)?|secrets(?:\..*)?|id_(?:rsa|ed25519|ecdsa)(?:\.pub)?|.*\.(?:pem|key|p12|pfx))$/i.test(part) && !/^\.env\.(?:example|sample|template)$/i.test(part));
}
