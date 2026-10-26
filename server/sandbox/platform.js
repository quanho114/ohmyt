import {BubblewrapSandbox} from './bubblewrap.js';
import {CodexWindowsSandbox} from './codex-windows-provider.js';

// Selection is trusted boot configuration, never model or repository input.
// Unsupported platforms fail closed rather than becoming native shell execution.
export class UnavailablePlatformSandbox {
  constructor(platform) { this.platform = platform; this.closed = false; }
  status() {
    return {
      provider: this.platform === 'win32' ? 'windows-unavailable' : 'unsupported',
      platform: this.platform,
      available: false,
      reason: this.closed ? 'Sandbox disposed' : this.platform === 'win32'
        ? 'Windows workspace sandbox is not implemented. A backend enforcing restricted reads, writes and network access is required; Linux bubblewrap cannot run on Windows. Host execution is not a fallback.'
        : `No workspace sandbox backend is implemented for ${this.platform}. Host execution is not a fallback.`,
    };
  }
  async execute() { throw new Error(`Workspace sandbox unavailable: ${this.status().reason}`); }
  cancel() { return false; }
  async dispose() { this.closed = true; }
}

export function createPlatformSandbox(platform = process.platform) {
  if (platform === 'linux') return new BubblewrapSandbox();
  if (platform === 'win32' && process.env.OHMYT_WINDOWS_SANDBOX === 'codex') return new CodexWindowsSandbox();
  return new UnavailablePlatformSandbox(platform);
}
