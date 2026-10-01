// Appearance only: this key never contains account, transaction, or AI data.
export const THEME_KEY = 'pa-accounting-theme';
export const LEGACY_THEME_KEY = 'theme';
export const DEFAULT_THEME = 'forest';

export const THEMES = Object.freeze([
  { id: 'warm', name: '暖白', nameEn: 'Warm white', description: '柔和纸感', descriptionEn: 'Soft paper tones', canvas: '#f4f1ea', sidebar: '#353029', accent: '#885332' },
  { id: 'graphite', name: '石墨', nameEn: 'Graphite', description: '沉静深色', descriptionEn: 'Calm and dark', canvas: '#181a1d', sidebar: '#101214', accent: '#dac29b' },
  { id: 'forest', name: '森林绿', nameEn: 'Forest', description: '自然清新', descriptionEn: 'Fresh and natural', canvas: '#eef3eb', sidebar: '#213b2c', accent: '#356747' },
  { id: 'amber', name: '琥珀', nameEn: 'Amber', description: '温暖明亮', descriptionEn: 'Warm and bright', canvas: '#fbf3e2', sidebar: '#49351f', accent: '#92540d' },
  { id: 'violet', name: '柔紫', nameEn: 'Soft violet', description: '轻柔雅致', descriptionEn: 'Soft and gentle', canvas: '#f5f0f7', sidebar: '#3d3048', accent: '#785391' },
] as const);

export type ThemeId = typeof THEMES[number]['id'];
export type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function isTheme(value: unknown): value is ThemeId {
  return THEMES.some(theme => theme.id === value);
}

export function normalizeTheme(value: unknown): ThemeId {
  return isTheme(value) ? value : DEFAULT_THEME;
}

export function readTheme(storage?: Pick<ThemeStorage, 'getItem'> | null): ThemeId {
  try {
    const saved = storage?.getItem(THEME_KEY);
    // An invalid new preference must not resurrect an old preference.
    if (saved !== null && saved !== undefined) return normalizeTheme(saved);
    const legacy = storage?.getItem(LEGACY_THEME_KEY);
    if (legacy === 'light') return 'warm';
    if (legacy === 'dark') return 'graphite';
  } catch {
    // Private browsing or unavailable storage does not block the application.
  }
  return DEFAULT_THEME;
}

export function persistTheme(storage: ThemeStorage | null | undefined, value: unknown): ThemeId {
  const theme = normalizeTheme(value);
  try { storage?.setItem(THEME_KEY, theme); } catch { /* In-memory switching still works. */ }
  return theme;
}

export function themeFromStorageEvent(event: {
  key: string | null;
  newValue: string | null;
  storageArea?: unknown;
}, storage: unknown): ThemeId | null {
  if (event.storageArea && event.storageArea !== storage) return null;
  if (event.key !== THEME_KEY && event.key !== null) return null;
  return normalizeTheme(event.newValue);
}

// One shared store updates subscribed controls without remounting app state.
export function createThemeStore(options: {
  storage?: ThemeStorage | null;
  apply?: (theme: ThemeId) => void;
} = {}) {
  let current = readTheme(options.storage);
  const listeners = new Set<() => void>();
  const commit = (value: unknown, persist: boolean) => {
    const next = normalizeTheme(value);
    if (persist) persistTheme(options.storage, next);
    options.apply?.(next);
    if (current === next) return;
    current = next;
    listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: (): ThemeId => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    initialize() {
      options.apply?.(current);
      persistTheme(options.storage, current);
    },
    setTheme: (value: unknown) => commit(value, true),
    // Remote events must not write back, which would cause cross-tab loops.
    syncTheme: (value: unknown) => commit(value, false),
  };
}
