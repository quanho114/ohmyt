import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseArguments, CliError, HELP} from './args.js';
import {connectRuntime, stopRuntime} from './runtime_connection.js';
import {submit, followSubmission} from './run.js';
import {Terminal, safeText, COMMANDS} from './terminal.js';

const enc = encodeURIComponent;
const inside = (root, target) => {const rel = path.relative(root, target); return rel === '' || !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel);};

async function resolveSession(client, options, ask) {
  const cwd = fs.realpathSync(path.resolve(options.cwd));
  if (!fs.statSync(cwd).isDirectory()) throw new CliError('-C must be a directory');
  const projects = await client.request('/projects');
  let project = projects.filter(item => !item.archived_at && inside(item.path, cwd)).sort((a, b) => b.path.length - a.path.length)[0];
  const sessions = await client.request('/sessions');
  let selected = options.sessionId ? sessions.find(item => item.id === options.sessionId) : null;
  if (options.sessionId && !selected) throw new CliError('Session not found');
  if (options.last || options.pickSession) {
    const available = sessions.filter(item => !item.archived_at && project && item.project_id === project.id).sort((a, b) => b.updated_at - a.updated_at || b.id.localeCompare(a.id));
    if (!available.length) throw new CliError('No saved chats in this project');
    if (options.last) selected = available[0];
    else if (ask.choose) {
      const id = await ask.choose('Resume a project chat', available.map(item => ({label: `${item.title} (${item.id})`, value: item.id})));
      selected = available.find(item => item.id === id);
      if (!selected) throw new CliError('Resume cancelled');
    }
    else {
      const number = Number(await ask(available.slice(0, 20).map((item, i) => `${i + 1}. ${item.title} (${item.id})`).join('\n') + '\nChoose chat number:'));
      selected = available[number - 1];
      if (!selected) throw new CliError('Invalid chat selection');
    }
  }
  if (selected) {
    if (options.command === 'review') throw new CliError('Review starts a new session; omit --session');
    if (!project || selected.project_id !== project.id) throw new CliError('Session project does not match cwd. Use -C with the session project directory.');
    return {session: selected, project};
  }
  if (!project) {
    if (!options.createProject && (!ask || !/^y(es)?$/i.test((await ask(`Register project ${cwd}? [y/N]`)).trim()))) throw new CliError('Project is not registered. Use --create-project to register cwd.');
    project = await client.request('/projects', {method: 'POST', body: {path: cwd}});
  }
  const session = await client.request('/sessions', {method: 'POST', body: {id: `sess_${randomUUID()}`, title: 'Terminal chat', projectId: project.id, ...(options.command === 'review' ? {workflowId: 'code-review'} : {})}});
  if (options.model) await selectModel(client, session.id, options.model);
  return {session, project};
}

async function selectModel(client, sessionId, value) {
  const slash = value.indexOf('/');
  if (slash < 1 || slash === value.length - 1) throw new CliError('Model format: PROVIDER_ID/MODEL_ID');
  await client.request(`/sessions/${enc(sessionId)}/model`, {method: 'PATCH', body: {override: {providerId: value.slice(0, slash), modelId: value.slice(slash + 1)}}});
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {process.stdout.write(HELP); return 0;}
  if (options.version) {process.stdout.write('ohmyt ' + JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version + '\n'); return 0;}
  if (!['start', 'stop'].includes(options.action) && options.command === 'daemon') throw new CliError('Usage: ohmyt daemon start|stop');
  if (options.command === 'sessions' && options.action !== 'list') throw new CliError('Usage: ohmyt sessions list');
  const interactive = ['chat', 'resume', 'fork', 'review'].includes(options.command);
  if (interactive && (!process.stdin.isTTY || !process.stderr.isTTY)) throw new CliError('Interactive mode needs a terminal. Use ohmyt exec "PROMPT" or ohmyt exec -');
  if (options.command === 'exec') {
    if (options.prompt === '-') {
      let text = '';
      for await (const chunk of process.stdin) {text += chunk; if (text.length > 100000) throw new CliError('Prompt exceeds 100000 characters');}
      options.prompt = text;
    }
    if (!options.prompt.trim()) throw new CliError('Usage: ohmyt exec "PROMPT" or ohmyt exec -');
  }
  const {client, descriptor} = await connectRuntime(options, {start: !['status', 'doctor', 'sessions'].includes(options.command) && !(options.command === 'daemon' && options.action === 'stop')});
  if (options.command === 'daemon') {
    if (options.action === 'stop') {await stopRuntime(descriptor); process.stdout.write('Runtime stopped.\n');}
    else process.stdout.write(`Runtime ready at ${descriptor.endpoint}\n`);
    return 0;
  }
  if (['status', 'doctor'].includes(options.command)) {
    const info = await client.handshake();
    process.stdout.write(safeText(JSON.stringify({endpoint: descriptor.endpoint, owner: descriptor.ownerKind, ...info}, null, 2)) + '\n');
    if (options.command === 'doctor') {
      const status = await client.request('/status');
      process.stdout.write(safeText(JSON.stringify(status, null, 2)) + '\n');
    }
    return 0;
  }
  if (options.command === 'sessions') {
    const sessions = await client.request('/sessions');
    const projects = await client.request('/projects');
    const cwd = fs.realpathSync(options.cwd), ids = new Set(projects.filter(item => inside(item.path, cwd)).map(item => item.id));
    for (const session of sessions.filter(item => ids.has(item.project_id) && !item.archived_at)) process.stdout.write(`${session.id}\t${safeText(session.title)}\n`);
    return 0;
  }
  if (interactive) return interactiveChat(client, options);
  const {session} = await resolveSession(client, options, null);
  if (options.model) await selectModel(client, session.id, options.model);
  const controls = await client.request(`/sessions/${enc(session.id)}/inbox`);
  if (controls.activeRunId && !options.enqueue) throw new CliError('This session is busy. Use --enqueue or a new session.');
  const id = await submit(client, session.id, options.prompt);
  const controller = new AbortController(); let interrupts = 0;
  const emit = event => {
    if (options.json) process.stdout.write(JSON.stringify({v: 1, ...event}) + '\n');
    else if (['tool.started', 'interaction.required', 'connection.reconnecting'].includes(event.type)) process.stderr.write(safeText(`${event.type}: ${event.name || event.kind || ''}`) + '\n');
  };
  emit({type: 'submission.accepted', sessionId: session.id, clientMessageId: id});
  const onInterrupt = () => {if (++interrupts > 1) {process.stderr.write('Cleanup is not confirmed; reconnect to inspect the run.\n'); process.exit(130);} controller.abort();};
  const onPipe = error => {if (error.code === 'EPIPE') controller.abort();};
  process.on('SIGINT', onInterrupt); process.on('SIGTERM', onInterrupt); process.stdout.on('error', onPipe);
  try {
    const {result, exitCode} = await followSubmission(client, session.id, id, {emit, signal: controller.signal});
    if (options.outputFile) fs.writeFileSync(options.outputFile, String(result.answer || '') + '\n');
    if (!options.json && result.answer) process.stdout.write(safeText(result.answer) + '\n');
    return exitCode;
  } finally {process.off('SIGINT', onInterrupt); process.off('SIGTERM', onInterrupt); process.stdout.off('error', onPipe);}
}

async function interactiveChat(client, options) {
  const terminal = new Terminal();
  let session, project, active = null, closing = false, done, exitCode = 0;
  const queued = [];
  const finished = new Promise(resolve => {done = resolve;});
  const ask = (question, signal) => terminal.question(question, signal);
  ask.choose = (title, items, signal) => terminal.choose(title, items, signal);
  const toolDetails = new Map();
  terminal.onDetails = () => {
    const tool = [...toolDetails.values()].at(-1);
    terminal.log(tool ? `${tool.name}\n${tool.inputPreview}\n${tool.output || '(running)'}${tool.truncated ? '\n[Preview truncated at 32 KiB]' : ''}` : 'No tool output yet.');
  };
  terminal.start();
  const report = error => terminal.log(`Error: ${error.message}`);
  const showHeader = async () => {
    toolDetails.clear();
    const [model, agents] = await Promise.all([client.request(`/sessions/${enc(session.id)}/model`), client.request('/agents')]);
    const agent = agents.find(item => item.id === session.agent_id);
    terminal.log(`ohmyt · ${project.path}\nModel ${model.override?.providerId || agent?.model_provider || 'default'}/${model.override?.modelId || agent?.model_name || 'default'}\nSession ${session.id}`); terminal.setStatus('Ready');
  };
  const emit = event => {
    if (event.type === 'assistant.delta') terminal.setLive(terminal.live + event.text);
    else if (event.type === 'assistant.reset') terminal.flushLive();
    else if (event.type === 'assistant.progress') terminal.log(event.text);
    else if (event.type === 'tool.started') {toolDetails.set(event.toolId, {name: event.name, inputPreview: JSON.stringify(event.input || {}, null, 2).slice(0, 32768)}); if (toolDetails.size > 50) toolDetails.delete(toolDetails.keys().next().value); terminal.log(`• ${event.name} ${JSON.stringify(event.input || {}).slice(0, 160)}`); terminal.setStatus(`Running ${event.name} · Ctrl+O details`);}
    else if (event.type === 'tool.completed') {toolDetails.set(event.toolId, {...toolDetails.get(event.toolId), ...event}); terminal.log(`${event.success ? '✓' : '!'} ${event.name} · Ctrl+O details`);}
    else if (event.type === 'interaction.required') terminal.setStatus('Waiting for your answer');
    else if (event.type === 'project.continuation') terminal.log('Choose the project with -C and open a new project chat to continue.');
  };
  const interact = async (request, signal) => {
    if (request.kind === 'approval') {
      const answer = await ask(`${request.description || request.toolName}\n${JSON.stringify(request.input || {})}\nAllow this action once? [y/N]`, signal);
      return /^y(es)?$/i.test(answer.trim()) ? 'ALLOW_ONCE' : 'DENY';
    }
    if (request.kind === 'project') return {skip: true};
    const answers = [];
    for (const question of request.questions) {
      if (signal.aborted) return {skip: true};
      const text = await ask(`${question.question}${question.options ? '\n' + question.options.map((item, i) => `${i + 1}. ${item}`).join('\n') : ''}\nAnswer (or /skip):`, signal);
      if (text === '/skip') return {skip: true};
      answers.push({id: question.id, answer: question.options?.[Number(text) - 1] || text});
    }
    return {answers};
  };
  const run = (prompt, observedRunId = null, submittedId = null) => {
    const controller = new AbortController();
    const state = {controller, observing: Boolean(observedRunId), detach: false};
    const task = (async () => {
      try {
        let id = submittedId;
        if (!observedRunId && !id) {terminal.log(`You › ${prompt}`); id = await submit(client, session.id, prompt);}
        terminal.setStatus(observedRunId ? 'Observing existing run' : 'Working · Esc stops');
        const response = await followSubmission(client, session.id, id, {emit, interact, signal: controller.signal, observedRunId, cancelOnInterrupt: () => !state.detach});
        if (!response.detached) {
          if (response.result.answer) terminal.setLive(response.result.answer);
          terminal.flushLive();
          terminal.log(`\n${response.result.status} · ${response.result.outcome?.taskStatus || 'unverified'}`);
        }
      } catch (error) {report(error);}
      finally {active = null; if (closing) done(); else if (queued.length) {const next = queued.shift(); run(next.prompt, null, next.id);} else terminal.setStatus('Ready');}
    })();
    active = Object.assign(state, {task});
  };
  const history = async () => {
    const events = [];
    let cursor = 0;
    for (;;) {
      const page = await client.request(`/sessions/${enc(session.id)}/events?afterSeq=${cursor}&limit=500`);
      events.push(...page.events);
      if (!page.events.length) break;
      cursor = page.events.at(-1).seq;
      if (page.events.length < 500) break;
    }
    const visible = events.filter(event => ['message/user', 'message/assistant'].includes(event.type) && typeof event.payload.message?.content === 'string' && event.payload.message.content.trim());
    if (visible.length) {
      for (const event of visible) terminal.logMarkdown(`${event.type === 'message/user' ? 'You' : 'ohmyt'} › ${event.payload.message.content}`);
      return;
    }
    // Legacy chats without semantic message events still use the supported
    // compatibility endpoint; no history is turned into execution here.
    const rows = await client.request(`/sessions/${enc(session.id)}/messages`);
    for (const message of rows) if (['human', 'user', 'agent'].includes(message.sender)) terminal.logMarkdown(`${message.sender === 'agent' ? 'ohmyt' : 'You'} › ${message.content}`);
  };
  let handling = false;
  terminal.onInterrupt = () => {
    if (terminal.pending) terminal.pending('');
    if (active) {terminal.setStatus('Stopping · waiting for cleanup'); active.controller.abort();}
    else {closing = true; done();}
  };
  const terminate = () => {closing = true; terminal.onInterrupt(); done();};
  process.once('SIGTERM', terminate);
  terminal.onSubmit = async text => {
    if (handling) return;
    handling = true;
    try {
      const [command, ...args] = text.split(/\s+/), value = args.join(' ');
      if (command === '/exit') {
        if (active) {
          const choice = await ask('Active run: [s]top and exit, [d]etach, or Enter to stay?');
          if (choice === 'd') {closing = true; active.detach = true; active.controller.abort(); done();}
          else if (choice === 's') {closing = true; active.controller.abort();}
        } else {closing = true; done();}
      } else if (command === '/help') terminal.log(COMMANDS.join(' · ') + '\nType while running to queue your next message.');
      else if (command === '/stop') active?.controller.abort();
      else if (command === '/status') terminal.log(JSON.stringify(await client.request(`/sessions/${enc(session.id)}/inbox`), null, 2));
      else if (active && ['/new', '/resume', '/fork', '/model', '/permissions', '/review', '/diff'].includes(command)) terminal.log('Stop the active task before changing session settings.');
      else if (command === '/new') {({session, project} = await resolveSession(client, {...options, sessionId: null, last: false, pickSession: false}, ask)); await showHeader();}
      else if (command === '/resume') {({session, project} = await resolveSession(client, {...options, sessionId: value || null, last: false, pickSession: !value}, ask)); await showHeader(); await history();}
      else if (command === '/fork') {
        const response = await client.request('/sessions/branch', {method: 'POST', body: {sourceSessionId: session.id, title: 'Terminal fork', includeContext: true}});
        session = response.session; await showHeader(); await history();
      } else if (command === '/model') {
        let selected = value;
        if (!selected) {
          const models = (await client.request('/models')).filter(model => model.enabled);
          if (!models.length) throw new CliError('No models configured in this runtime. Configure a provider in the desktop app.');
          selected = await ask.choose('Choose a model', models.map(model => ({label: `${model.display_name || model.model_id} · ${model.provider_id}`, value: `${model.provider_id}/${model.model_id}`})));
        }
        if (selected) {await selectModel(client, session.id, selected); options.model = selected; terminal.log(`Model: ${selected}`);}
      } else if (command === '/permissions') {
        const mode = value || await ask.choose('Approval mode for next run', [{label: 'Ask — human approval when required', value: 'ask'}, {label: 'Auto — backend review within policy', value: 'auto'}, {label: 'Full — allow within backend scope and DENY rules', value: 'full'}]);
        if (mode && (mode !== 'full' || /^y$/i.test(await ask('Allow full mode within backend scope and DENY rules? [y/N]')))) {
          await client.request(`/sessions/${enc(session.id)}/approval-mode`, {method: 'PUT', body: {mode}}); terminal.log(`Approval mode: ${mode}`);
        }
      } else if (command === '/review' || command === '/diff') {
        ({session, project} = await resolveSession(client, {...options, command: 'review', sessionId: null, last: false, pickSession: false}, ask));
        await showHeader(); run(value || (command === '/diff' ? 'Show the current git diff including a summary of untracked files. Read only; do not edit files.' : 'Review current changes with file and line references. Do not edit files.'));
      }
      else if (command === '/steer') {
        if (!active || active.observing || !value.trim()) throw new CliError('Use /steer TEXT while your task is running');
        await client.request(`/sessions/${enc(session.id)}/inbox`, {method: 'POST', body: {clientMessageId: randomUUID(), kind: 'steering', content: value}});
        terminal.log('Steering submitted.');
      }
      else if (text.startsWith('/')) throw new CliError('Unknown command. Use /help');
      else if (active) {const id = await submit(client, session.id, text); queued.push({id, prompt: text}); terminal.log(`Queued › ${text}`);}
      else run(text);
    } catch (error) {report(error);} finally {handling = false;}
  };
  try {
    ({session, project} = await resolveSession(client, options, ask));
    if (options.command === 'fork') {
      const response = await client.request('/sessions/branch', {method: 'POST', body: {sourceSessionId: session.id, title: 'Terminal fork', includeContext: true}}); session = response.session;
    }
    if (options.model) await selectModel(client, session.id, options.model);
    if (options.command === 'review') {
      options.prompt = options.prompt || 'Review the current project changes. Report bugs with file and line references. Do not edit files.';
    }
    await showHeader(); await history();
    const controls = await client.request(`/sessions/${enc(session.id)}/inbox`);
    if (controls.activeRunId) run('', controls.activeRunId);
    else if (options.prompt) run(options.prompt);
    await finished;
  } finally {
    process.off('SIGTERM', terminate);
    try {if (active) {active.controller.abort(); await active.task;}} finally {terminal.close();}
  }
  return exitCode;
}
