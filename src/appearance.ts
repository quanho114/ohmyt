export type ThemeMode = 'light' | 'dark' | 'system';
export type SettingsLocale = 'vi' | 'en';
export type ResponseLanguage = 'auto' | 'vi' | 'en';

export const appearanceOptions = {
  themeMode: ['light', 'dark', 'system'],
  locale: ['system', 'vi', 'en'],
  responseAnimation: ['off', 'snappy', 'elegant'],
  contextMenu: ['off', 'default'],
  responseLanguage: ['auto', 'vi', 'en'],
  accent: ['default', 'red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'sky', 'blue', 'purple', 'magenta', 'coral'],
  neutral: ['default', 'slate', 'gray', 'zinc', 'neutral', 'stone'],
  transition: ['none', 'fade', 'smooth'],
  codeTheme: ['lobe', 'github', 'nord'],
  mermaidTheme: ['lobe', 'default', 'neutral', 'forest', 'dark']
} as const;

type ChoiceFields = { [K in keyof typeof appearanceOptions]: (typeof appearanceOptions)[K][number] };
export type Appearance = ChoiceFields & {
  antialiasing: boolean;
  fontSize: number;
  autoScroll: boolean;
  autoExpandTools: boolean;
  linkIcons: boolean;
};

export const defaultAppearance: Appearance = {
  themeMode: 'system', locale: 'system', responseAnimation: 'snappy', contextMenu: 'default',
  responseLanguage: 'auto', accent: 'default', neutral: 'default', antialiasing: true,
  fontSize: 14, transition: 'fade', autoScroll: true, autoExpandTools: false,
  linkIcons: true, codeTheme: 'lobe', mermaidTheme: 'lobe'
};

export function normalizeAppearance(raw: unknown, legacyTheme?: string | null): Appearance {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const result = { ...defaultAppearance };
  for (const key of Object.keys(appearanceOptions) as Array<keyof ChoiceFields>) {
    const value = source[key];
    if (typeof value === 'string' && (appearanceOptions[key] as readonly string[]).includes(value)) {
      Object.assign(result, { [key]: value });
    }
  }
  if (!appearanceOptions.themeMode.includes(source.themeMode as ThemeMode) && appearanceOptions.themeMode.includes(legacyTheme as ThemeMode)) {
    result.themeMode = legacyTheme as ThemeMode;
  }
  for (const key of ['antialiasing', 'autoScroll', 'autoExpandTools', 'linkIcons'] as const) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  if (typeof source.fontSize === 'number' && Number.isFinite(source.fontSize)) {
    result.fontSize = Math.max(12, Math.min(20, Math.round(source.fontSize)));
  }
  return result;
}

export function readAppearance(storage: Pick<Storage, 'getItem'>): Appearance {
  let theme: string | null = null;
  try { theme = storage.getItem('ohmyt_theme') || storage.getItem('lobe_core_theme'); } catch {}
  try { return normalizeAppearance(JSON.parse(storage.getItem('ohmyt_appearance') || '{}'), theme); }
  catch { return normalizeAppearance(null, theme); }
}

export function resolveLocale(value: Appearance['locale'], language: string): SettingsLocale {
  return value === 'system' ? (language.toLowerCase().startsWith('vi') ? 'vi' : 'en') : value;
}

export function applyAppearance(value: Appearance, root: HTMLElement, systemDark: boolean): 'light' | 'dark' {
  const active = value.themeMode === 'system' ? (systemDark ? 'dark' : 'light') : value.themeMode;
  root.dataset.theme = active;
  root.dataset.accent = value.accent;
  root.dataset.neutral = value.neutral;
  root.dataset.responseAnimation = value.responseAnimation;
  root.dataset.transition = value.transition;
  root.dataset.antialiasing = String(value.antialiasing);
  root.style.setProperty('--message-font-size', `${value.fontSize}px`);
  root.lang = resolveLocale(value.locale, typeof navigator === 'undefined' ? 'vi' : navigator.language);
  return active;
}
