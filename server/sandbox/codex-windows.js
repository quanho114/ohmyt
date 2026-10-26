import path from 'node:path';

export const CODEX_WINDOWS_SUPPORTED_VERSION = '0.164.0';

// Trusted host inputs only. This builds configuration, not an execution provider:
// Codex elevated launches may provision accounts/ACLs and need explicit setup consent.
export function buildCodexWindowsPolicy({workspaceRoot, runtimeRoots = [], denyPaths = [], allowHostRead = false}) {
  const absolute = value => {
    if (typeof value !== 'string' || !path.win32.isAbsolute(value) || value.includes('\0') || value.startsWith('\\\\') || value.startsWith('\\\\?\\')) throw new Error('Sandbox policy requires local absolute Windows paths');
    return path.win32.normalize(value);
  };
  const root = absolute(workspaceRoot);
  if (typeof allowHostRead !== 'boolean') throw new Error('allowHostRead must be an explicit boolean');
  const entries = new Map([[allowHostRead ? ':root' : ':minimal', 'read'], [root, 'write']]);
  for (const value of runtimeRoots) {
    const runtime = absolute(value);
    if (runtime.toLowerCase() === root.toLowerCase()) continue;
    entries.set(runtime, 'read');
  }
  for (const value of denyPaths) entries.set(absolute(value), 'none');
  const lines = ['default_permissions = "ohmyt-project"', '[windows]', 'sandbox = "elevated"', '[permissions.ohmyt-project.filesystem]'];
  for (const [target, permission] of entries) lines.push(`${JSON.stringify(target)} = ${JSON.stringify(permission)}`);
  lines.push('[permissions.ohmyt-project.network]', 'enabled = false', '[shell_environment_policy]', 'inherit = "none"', '[shell_environment_policy.set]', `SystemRoot = ${JSON.stringify(process.env.SystemRoot || 'C:\\Windows')}`, `WINDIR = ${JSON.stringify(process.env.SystemRoot || 'C:\\Windows')}`, `SystemDrive = ${JSON.stringify(path.win32.parse(process.env.SystemRoot || 'C:\\Windows').root.replace(/\\$/, ''))}`);
  return lines.join('\n') + '\n';
}

// Use this only with a dedicated CODEX_HOME/config.toml containing the returned
// policy. Runtime integration must also prevent project/system config from widening
// the effective profile; this builder alone is not evidence of enforcement.
export function buildCodexWindowsArguments({workspaceRoot, argv, runtimeRoots, denyPaths, allowHostRead = false}) {
  if (!Array.isArray(argv) || !argv.length || !argv[0] || argv.some(value => typeof value !== 'string' || value.includes('\0'))) throw new Error('Invalid sandbox argv');
  const policy = buildCodexWindowsPolicy({workspaceRoot,runtimeRoots,denyPaths,allowHostRead});
  return {policy, args:['sandbox','-P','ohmyt-project','-C',path.win32.normalize(workspaceRoot),'--',...argv]};
}
