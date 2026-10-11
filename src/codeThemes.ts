import type { CSSProperties } from 'react';

// Each palette owns its canvas and token colors, independently of the app theme.
export const codePalettes = {
  'tokyo-night': { name: 'Tokyo Night', dark: true, colors: ['#1a1b26', '#c0caf5', '#bb9af7', '#9ece6a', '#ff9e64', '#7aa2f7', '#7dcfff', '#8993b5'] },
  dracula: { name: 'Dracula', dark: true, colors: ['#282a36', '#f8f8f2', '#ff79c6', '#f1fa8c', '#bd93f9', '#50fa7b', '#8be9fd', '#929bc3'] },
  'catppuccin-mocha': { name: 'Catppuccin Mocha', dark: true, colors: ['#1e1e2e', '#cdd6f4', '#cba6f7', '#a6e3a1', '#fab387', '#89b4fa', '#f9e2af', '#9399b2'] },
  'rose-pine': { name: 'Rose Pine', dark: true, colors: ['#191724', '#e0def4', '#c4a7e7', '#f6c177', '#ebbcba', '#9ccfd8', '#eb6f92', '#908caa'] },
  monokai: { name: 'Monokai', dark: true, colors: ['#272822', '#f8f8f2', '#f92672', '#e6db74', '#ae81ff', '#a6e22e', '#66d9ef', '#a6a794'] },
  'one-dark': { name: 'One Dark', dark: true, colors: ['#282c34', '#abb2bf', '#c678dd', '#98c379', '#d19a66', '#61afef', '#e5c07b', '#929baa'] },
  'ocean-deep': { name: 'Ocean Deep', dark: true, colors: ['#102b36', '#d5e9ed', '#c6a2ee', '#9bdbb5', '#f5bc83', '#78cced', '#efb4c8', '#8cabb6'] },
  'rose-dawn': { name: 'Rose Dawn', dark: false, colors: ['#faf4ed', '#575279', '#907aa9', '#9c6326', '#b4637a', '#286983', '#a34d68', '#797593'] },
  'catppuccin-latte': { name: 'Catppuccin Latte', dark: false, colors: ['#eff1f5', '#4c4f69', '#8839ef', '#407c20', '#a95616', '#1e66f5', '#9e3163', '#6c6f85'] },
  paper: { name: 'Paper', dark: false, colors: ['#f7f5ef', '#343b45', '#8150a0', '#39714b', '#a45125', '#2c6293', '#8e4661', '#727b80'] },
  sakura: { name: 'Sakura', dark: false, colors: ['#fff3f6', '#594653', '#9a3970', '#477548', '#a45630', '#6553a4', '#a13f58', '#876c7d'] },
  mint: { name: 'Mint', dark: false, colors: ['#f0f8f4', '#344e47', '#75539b', '#2a765a', '#a1562c', '#286b8f', '#97506e', '#647e72'] },
} as const;

export const codeThemeOptions: Array<[string, string]> = [
  ['lobe', 'Default'], ['github', 'GitHub'], ['nord', 'Nord'],
  ...Object.entries(codePalettes).map(([id, palette]): [string, string] => [id, palette.name]),
];

export function codeThemeStyle(theme: string): CSSProperties | undefined {
  if (!Object.hasOwn(codePalettes, theme)) return undefined;
  const palette = codePalettes[theme as keyof typeof codePalettes];
  const names = ['background', 'foreground', 'keyword', 'string', 'number', 'title', 'attr', 'comment'];
  return Object.fromEntries(names.map((name, index) => [`--syntax-${name}`, palette.colors[index]])) as CSSProperties;
}
