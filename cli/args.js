export class CliError extends Error {
  constructor(message, exitCode = 2) {super(message); this.exitCode = exitCode;}
}

export function parseArguments(argv) {
  const result = {command: 'chat', cwd: process.cwd(), prompt: '', json: false};
  const values = new Map([['-C', 'cwd'], ['--cd', 'cwd'], ['--endpoint', 'endpoint'], ['--token-file', 'tokenFile'], ['--data-dir', 'dataDir'], ['--session', 'sessionId'], ['--model', 'model'], ['-m', 'model'], ['--output-last-message', 'outputFile'], ['-o', 'outputFile']]);
  const flags = new Map([['--json', 'json'], ['--last', 'last'], ['--create-project', 'createProject'], ['--enqueue', 'enqueue'], ['--dev', 'dev'], ['--help', 'help'], ['-h', 'help'], ['--version', 'version']]);
  const commands = new Set(['exec', 'resume', 'fork', 'review', 'sessions', 'status', 'doctor', 'daemon']);
  const positionals = [];
  let literal = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!literal && arg === '--') {literal = true; continue;}
    if (!literal && values.has(arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('-')) throw new CliError(`Missing value for ${arg}`);
      result[values.get(arg)] = argv[++i]; continue;
    }
    if (!literal && flags.has(arg)) {result[flags.get(arg)] = true; continue;}
    if (!literal && arg.startsWith('-') && arg !== '-') throw new CliError(`Unknown option: ${arg}`);
    positionals.push(arg);
  }
  if (commands.has(positionals[0])) result.command = positionals.shift();
  if (['daemon', 'sessions'].includes(result.command)) result.action = positionals.shift();
  if (['resume', 'fork'].includes(result.command)) result.sessionId = positionals.shift() || result.sessionId;
  result.prompt = positionals.join(' ');
  if (result.command === 'resume' && !result.sessionId && !result.last) result.pickSession = true;
  if (result.command === 'fork' && !result.sessionId) throw new CliError('Usage: ohmyt fork SESSION_ID');
  if (result.json && result.command !== 'exec') throw new CliError('--json is supported by exec');
  return result;
}

export const HELP = `ohmyt — AI assistant in your terminal

Usage: ohmyt [OPTIONS] [PROMPT]
       ohmyt exec [--json] [PROMPT|-]
       ohmyt resume [SESSION_ID|--last]
       ohmyt fork SESSION_ID
       ohmyt review [PROMPT]
       ohmyt sessions list
       ohmyt status | doctor
       ohmyt daemon start|stop

Options:
  -C, --cd PATH              Project directory (default: current directory)
  --endpoint URL            Existing loopback daemon
  --token-file PATH         Private file containing its Bearer token
  --dev                     Explicitly allow an unauthenticated dev daemon
  --data-dir PATH            Headless profile data directory
  --session ID              Use an existing project session
  --create-project          Register cwd without interactive confirmation
  --enqueue                 Queue exec behind existing work
  --model PROVIDER/MODEL    Select model for this session
  --output-last-message PATH Write final answer to a file
  --help                    Show help

Interactive: Enter sends, Alt+Enter adds a line, /help lists commands.
Exec: stdout contains the answer or JSONL; progress goes to stderr.
`;
