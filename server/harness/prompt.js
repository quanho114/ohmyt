// Ordered, effect-owned prompt contributions, following DSH's system-prompt seam.
export class SystemPrompt {
  constructor() { this.sections = new Map(); }

  section(ctx, { name, order = 0, text }) {
    if (typeof name !== 'string' || !name || this.sections.has(name)) throw new Error(`Duplicate prompt section: ${name}`);
    if (!Number.isFinite(order) || !['string','function'].includes(typeof text)) throw new Error(`Invalid prompt section: ${name}`);
    const entry = { name, order, text };
    return ctx.effect(() => {
      this.sections.set(name, entry);
      return () => { if (this.sections.get(name) === entry) this.sections.delete(name); };
    }, `prompt:${name}`);
  }

  assemble(context) {
    return [...this.sections.values()]
      .sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map(section => {
        const text = typeof section.text === 'function' ? section.text(context) : section.text;
        if (typeof text !== 'string') throw new Error(`Prompt section must return a string: ${section.name}`);
        return text;
      })
      .filter(Boolean).join('\n\n');
  }
}

export function freezeValue(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeValue(child);
  return Object.freeze(value);
}
