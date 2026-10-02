import { useState, useEffect } from 'react';
import { Appearance, applyAppearance, defaultAppearance, normalizeAppearance, readAppearance, resolveLocale } from './appearance.ts';

export function useTheme() {
  const [appearance, setAppearance] = useState<Appearance>(() => {
    try { return readAppearance(window.localStorage); }
    catch { return { ...defaultAppearance }; }
  });
  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined' && document.documentElement.dataset?.theme === 'dark') return 'dark';
    return 'light';
  });
  const [language, setLanguage] = useState(() => typeof navigator === 'undefined' ? 'vi' : navigator.language);
  const [saveState, setSaveState] = useState<'saved' | 'failed'>('saved');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setActiveTheme(applyAppearance(appearance, document.documentElement, media.matches));
    apply();
    media.addEventListener('change', apply);
    try {
      localStorage.setItem('ohmyt_appearance', JSON.stringify(appearance));
      localStorage.setItem('ohmyt_theme', appearance.themeMode);
      setSaveState('saved');
    } catch { setSaveState('failed'); }
    return () => media.removeEventListener('change', apply);
  }, [appearance]);

  useEffect(() => {
    const update = () => setLanguage(navigator.language);
    window.addEventListener('languagechange', update);
    return () => window.removeEventListener('languagechange', update);
  }, []);

  const updateAppearance = (patch: Partial<Appearance>) => {
    setAppearance(current => normalizeAppearance({ ...current, ...patch }));
  };
  return {
    appearance, updateAppearance, activeTheme, saveState,
    locale: resolveLocale(appearance.locale, language),
    toggleQuickTheme: () => updateAppearance({ themeMode: activeTheme === 'dark' ? 'light' : 'dark' })
  };
}
