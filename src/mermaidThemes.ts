import type { MermaidConfig } from 'mermaid';

// Literal colors keep Mermaid's color calculations independent of CSS variables.
export const mermaidPalettes = {
  'zinc-light': ['Zinc Light', '#ffffff', '#f4f4f5', '#27272a', '#a1a1aa', '#71717a', false],
  'zinc-dark': ['Zinc Dark', '#18181b', '#27272a', '#fafafa', '#52525b', '#a1a1aa', true],
  'tokyo-night': ['Tokyo Night', '#1a1b26', '#24283b', '#c0caf5', '#414868', '#7aa2f7', true],
  'tokyo-night-storm': ['Tokyo Night Storm', '#24283b', '#292e42', '#c0caf5', '#565f89', '#7aa2f7', true],
  'tokyo-night-light': ['Tokyo Night Light', '#d5d6db', '#e1e2e7', '#343b58', '#9699a3', '#34548a', false],
  'catppuccin-mocha': ['Catppuccin Mocha', '#1e1e2e', '#313244', '#cdd6f4', '#585b70', '#cba6f7', true],
  'catppuccin-latte': ['Catppuccin Latte', '#eff1f5', '#e6e9ef', '#4c4f69', '#9ca0b0', '#8839ef', false],
  'nord': ['Nord', '#2e3440', '#3b4252', '#eceff4', '#4c566a', '#88c0d0', true],
  'nord-light': ['Nord Light', '#eceff4', '#e5e9f0', '#2e3440', '#a3b1c2', '#5e81ac', false],
  'dracula': ['Dracula', '#282a36', '#44475a', '#f8f8f2', '#6272a4', '#bd93f9', true],
  'github-light': ['GitHub Light', '#ffffff', '#f6f8fa', '#1f2328', '#d0d7de', '#0969da', false],
  'github-dark': ['GitHub Dark', '#0d1117', '#161b22', '#e6edf3', '#30363d', '#58a6ff', true],
  'solarized-light': ['Solarized Light', '#fdf6e3', '#eee8d5', '#586e75', '#93a1a1', '#268bd2', false],
  'solarized-dark': ['Solarized Dark', '#002b36', '#073642', '#93a1a1', '#586e75', '#2aa198', true],
  'one-dark': ['One Dark', '#282c34', '#3e4451', '#abb2bf', '#5c6370', '#61afef', true],
} as const;

export const mermaidThemeOptions: Array<[string, string]> = [
  ['lobe', 'Default'],
  ...Object.entries(mermaidPalettes).map(([id, palette]): [string, string] => [id, palette[0]]),
  ['default', 'Classic'], ['neutral', 'Neutral'], ['forest', 'Forest'], ['dark', 'Dark'],
];

export function mermaidThemeConfig(id: string): Pick<MermaidConfig, 'theme' | 'themeVariables'> {
  if (!Object.hasOwn(mermaidPalettes, id)) {
    return { theme: id === 'lobe' ? 'base' : id as MermaidConfig['theme'] };
  }
  const [, background, surface, text, border, accent, darkMode] = mermaidPalettes[id as keyof typeof mermaidPalettes];
  return {
    theme: 'base',
    themeVariables: {
      darkMode, background, primaryColor: surface, primaryTextColor: text,
      primaryBorderColor: border, secondaryColor: surface, tertiaryColor: surface,
      lineColor: accent, textColor: text, actorBkg: surface, actorBorder: border,
      actorTextColor: text, signalColor: accent, signalTextColor: text,
      labelBoxBkgColor: surface, labelBoxBorderColor: border, labelTextColor: text,
      loopTextColor: text, noteBkgColor: surface, noteTextColor: text, noteBorderColor: border,
    },
  };
}

export function mermaidThemeBackground(id: string): string | undefined {
  return Object.hasOwn(mermaidPalettes, id) ? mermaidPalettes[id as keyof typeof mermaidPalettes][1] : undefined;
}
