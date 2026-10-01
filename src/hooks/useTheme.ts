import { useSyncExternalStore } from 'react';
import { createThemeStore, DEFAULT_THEME, THEMES, themeFromStorageEvent } from '../utils/theme';
import type { ThemeId, ThemeStorage } from '../utils/theme';

let store: ReturnType<typeof createThemeStore> | undefined;

function applyDocumentTheme(theme: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'graphite');
  root.classList.toggle('light', theme !== 'graphite');
  root.style.colorScheme = theme === 'graphite' ? 'dark' : 'light';
  root.style.backgroundColor = THEMES.find(item => item.id === theme)!.canvas;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEMES.find(item => item.id === theme)!.canvas;
}

export function initializeTheme() {
  if (typeof window === 'undefined' || store) return;
  let storage: ThemeStorage | null = null;
  try { storage = window.localStorage; } catch { /* Storage may be blocked. */ }
  store = createThemeStore({ storage, apply: applyDocumentTheme });
  store.initialize();
  const onStorage = (event: StorageEvent) => {
    // sessionStorage and unrelated app data must never change appearance.
    const theme = themeFromStorageEvent(event, storage);
    if (theme !== null) store?.syncTheme(theme);
  };
  window.addEventListener('storage', onStorage);
  if (import.meta.hot) {
    import.meta.hot.dispose(() => window.removeEventListener('storage', onStorage));
  }
}

function getStore() {
  initializeTheme();
  return store;
}

const subscribe = (listener: () => void) => getStore()?.subscribe(listener) ?? (() => {});
const getSnapshot = () => getStore()?.getSnapshot() ?? DEFAULT_THEME;
const getServerSnapshot = () => DEFAULT_THEME;
const setTheme = (theme: ThemeId) => getStore()?.setTheme(theme);
const toggleTheme = () => setTheme(getSnapshot() === 'graphite' ? 'forest' : 'graphite');

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { theme, setTheme, toggleTheme, isDark: theme === 'graphite', themes: THEMES };
}
