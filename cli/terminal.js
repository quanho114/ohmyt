import {stripVTControlCharacters} from 'node:util';
import {emitKeypressEvents} from 'node:readline';

export function safeText(value) {
  return stripVTControlCharacters(String(value ?? '')).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}

function markdown(text) {
  const clean = safeText(text);
  if (process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb') return clean;
  return clean.replace(/^(#{1,6}) (.+)$/gm, '\x1b[1m$2\x1b[0m')
    .replace(/\*\*([^*\n]+)\*\*/g, '\x1b[1m$1\x1b[0m')
    .replace(/`([^`\n]+)`/g, '\x1b[36m$1\x1b[0m');
}

export const COMMANDS = ['/help', '/new', '/resume', '/model', '/permissions', '/status', '/diff', '/review', '/fork', '/steer', '/stop', '/exit'];

function layout(text, width, cursor = Infinity) {
  const rows = ['']; let row = 0, col = 0, caret = {row: 0, col: 0};
  for (const [index, char] of Array.from(text).entries()) {
    const cells = /\p{Mark}|\u200d|\ufe0f/u.test(char) ? 0 : /\p{Extended_Pictographic}|\p{Script=Han}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(char) ? 2 : 1;
    if (char !== '\n' && col + cells > width) {rows.push(''); row++; col = 0;}
    if (index === cursor) caret = {row, col};
    if (char === '\n') {rows.push(''); row++; col = 0;}
    else {rows[row] += char; col += cells;}
  }
  if (cursor >= Array.from(text).length) caret = {row, col};
  return {rows, caret};
}

// A scrollback transcript with a redrawable composer. No model output is ever
// interpreted as terminal control sequences.
export class Terminal {
  constructor(input = process.stdin, output = process.stderr) {
    this.input = input; this.output = output; this.history = []; this.draft = ''; this.cursor = 0;
    this.status = 'Ready'; this.pending = null; this.lines = 0; this.selection = 0; this.live = '';
    this.onKey = (str, key) => this.key(str, key || {});
    this.resize = () => this.draw();
  }
  start() {
    emitKeypressEvents(this.input); this.wasRaw = this.input.isRaw;
    this.input.setRawMode(true); this.input.resume();
    this.input.on('keypress', this.onKey); this.output.on('resize', this.resize);
    this.output.write('\x1b[?2004h');
    this.draw();
  }
  clear() {
    if (!this.lines) return;
    this.output.write(`\r${this.cursorRow ? `\x1b[${this.cursorRow}A` : ''}\x1b[J`); this.lines = 0; this.cursorRow = 0;
  }
  draw() {
    this.clear();
    const width = Math.max(20, (this.output.columns || 80) - 4);
    const clean = safeText(this.draft), composed = layout(clean, width, this.cursor), chunks = composed.rows;
    const suggestions = !this.pending && this.draft.startsWith('/') && !this.draft.includes(' ') ? COMMANDS.filter(command => command.startsWith(this.draft)) : [];
    this.suggestions = suggestions;
    this.selection = Math.min(this.selection, Math.max(0, suggestions.length - 1));
    const from = Math.max(0, composed.caret.row - 5), shown = chunks.slice(from, from + 6);
    const live = this.live ? layout(safeText(this.live), width).rows.slice(-Math.max(2, (this.output.rows || 24) - 12)) : [];
    const choices = this.menu ? this.menu.items.filter(item => item.label.toLowerCase().includes(clean.toLowerCase())) : [];
    this.menuChoices = choices;
    if (this.menu) this.menu.selected = Math.min(this.menu.selected, Math.max(0, choices.length - 1));
    const menuStart = Math.max(0, this.menu?.selected - 5 || 0);
    const menu = this.menu ? choices.slice(menuStart, menuStart + 6).map(item => layout(`${choices[this.menu.selected] === item ? '›' : ' '} ${safeText(item.label)}`, width).rows[0]) : [];
    const text = [...live, ...shown.map((line, i) => `${i ? '  ' : '› '}${line}`), ...menu, ...(suggestions.length ? [suggestions.map((s, i) => i === this.selection ? `[${s}]` : s).join(' ').slice(0, width)] : []), `  ${safeText(this.status).slice(0, Math.max(0, width - 30))} · /help · Alt+Enter newline`.slice(0, width + 2)];
    this.output.write(text.join('\n'));
    this.lines = text.length;
    this.cursorRow = live.length + composed.caret.row - from;
    const up = this.lines - 1 - this.cursorRow;
    this.output.write(`${up > 0 ? `\x1b[${up}A` : ''}\r\x1b[${composed.caret.col + 2}C`);
  }
  log(text) {this.clear(); this.output.write(safeText(text) + '\n'); this.draw();}
  setLive(text) {this.live = text; this.draw();}
  flushLive() {if (this.live) {const text = this.live; this.live = ''; this.logMarkdown(text);}}
  logMarkdown(text) {this.clear(); this.output.write(markdown(text) + '\n'); this.draw();}
  setStatus(text) {this.status = text; this.draw();}
  async choose(title, items, signal) {
    this.menu = {items, selected: 0};
    try {return await this.question(title + '\nType to filter · ↑/↓ select · Enter confirm · Esc cancel', signal);}
    finally {this.menu = null; this.draw();}
  }
  question(text, signal) {
    if (this.pending) return Promise.reject(new Error('A terminal question is already open'));
    this.savedDraft = this.draft; this.draft = ''; this.cursor = 0;
    return new Promise(resolve => {
      const finish = value => {
        if (this.pending !== finish) return;
        this.pending = null; this.draft = this.savedDraft || ''; this.cursor = Array.from(this.draft).length; this.savedDraft = '';
        signal?.removeEventListener('abort', cancel); resolve(value); this.draw();
      };
      const cancel = () => finish('');
      this.pending = finish; this.log(text); this.draw();
      signal?.addEventListener('abort', cancel, {once: true}); if (signal?.aborted) cancel();
    });
  }
  async key(str, key) {
    const insert = text => {const chars = Array.from(this.draft); chars.splice(this.cursor, 0, ...Array.from(text)); this.cursor += Array.from(text).length; this.draft = chars.join('');};
    if (key.name === 'paste-start') {this.pasting = true; return;}
    if (key.name === 'paste-end') {this.pasting = false; this.draw(); return;}
    if (this.pasting) {if (str) insert(safeText(str)); return;}
    if (this.menu && key.name === 'escape') {this.pending?.(''); return;}
    if (this.menu && ['up', 'down'].includes(key.name)) {
      const count = this.menuChoices.length;
      if (count) this.menu.selected = (this.menu.selected + (key.name === 'up' ? -1 : 1) + count) % count;
      this.draw(); return;
    }
    if (this.menu && ['return', 'enter'].includes(key.name)) {const item = this.menuChoices[this.menu.selected]; if (item) this.pending?.(item.value); return;}
    if (key.ctrl && key.name === 'o') {this.onDetails?.(); return;}
    if (key.ctrl && key.name === 'c') {this.onInterrupt?.(); return;}
    if (key.name === 'escape') {if (this.suggestions?.length) {this.draft = ''; this.draw();} else this.onInterrupt?.(); return;}
    if (['return', 'enter'].includes(key.name) && (key.meta || key.shift)) insert('\n');
    else if (['return', 'enter'].includes(key.name)) {
      if (this.suggestions?.length && this.draft !== this.suggestions[this.selection]) {this.draft = this.suggestions[this.selection]; this.cursor = this.draft.length; this.draw(); return;}
      const value = this.draft; this.draft = ''; this.cursor = 0; this.selection = 0;
      if (this.pending) this.pending(value);
      else if (value.trim()) {this.history.push(value); this.historyIndex = this.history.length; this.onSubmit?.(value);}
    } else if (key.name === 'backspace') {const chars = Array.from(this.draft); if (this.cursor > 0) chars.splice(--this.cursor, 1); this.draft = chars.join('');}
    else if (key.name === 'delete') {const chars = Array.from(this.draft); chars.splice(this.cursor, 1); this.draft = chars.join('');}
    else if (key.name === 'left') this.cursor = Math.max(0, this.cursor - 1);
    else if (key.name === 'right') this.cursor = Math.min(Array.from(this.draft).length, this.cursor + 1);
    else if (key.name === 'home' || key.ctrl && key.name === 'a') this.cursor = 0;
    else if (key.name === 'end' || key.ctrl && key.name === 'e') this.cursor = Array.from(this.draft).length;
    else if (key.name === 'tab' && this.suggestions?.length) {this.draft = this.suggestions[this.selection]; this.cursor = this.draft.length;}
    else if (key.name === 'up' || key.name === 'down') {
      const delta = key.name === 'up' ? -1 : 1;
      if (this.suggestions?.length) this.selection = (this.selection + delta + this.suggestions.length) % this.suggestions.length;
      else {this.historyIndex = Math.min(this.history.length, Math.max(0, (this.historyIndex ?? this.history.length) + delta)); this.draft = this.history[this.historyIndex] || ''; this.cursor = Array.from(this.draft).length;}
    } else if (key.ctrl && key.name === 'u') {this.draft = ''; this.cursor = 0;}
    else if (key.ctrl && key.name === 'd' && !this.draft) this.onSubmit?.('/exit');
    else if (!key.ctrl && !key.meta && str) insert(safeText(str));
    if (this.draft.length > 100000) {this.draft = this.draft.slice(0, 100000); this.cursor = Math.min(this.cursor, Array.from(this.draft).length);}
    this.draw();
  }
  close() {
    this.pending?.('');
    this.clear(); this.input.off('keypress', this.onKey); this.output.off('resize', this.resize);
    this.input.setRawMode(Boolean(this.wasRaw)); this.input.pause();
    this.output.write('\x1b[?2004l\x1b[?25h');
  }
}
