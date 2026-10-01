import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  createThemeStore, DEFAULT_THEME, isTheme, LEGACY_THEME_KEY,
  normalizeTheme, persistTheme, readTheme, THEME_KEY, THEMES, themeFromStorageEvent,
} from '../src/utils/theme.ts';
import type { ThemeId } from '../src/utils/theme.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const writes: [string, string][] = [];
  return {
    values, writes,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push([key, value]); values.set(key, value); },
  };
}

test('forest is the default and all five exact ids are accepted', () => {
  assert.equal(DEFAULT_THEME, 'forest');
  assert.equal(THEMES.length, 5);
  assert.equal(new Set(THEMES.map(theme => theme.id)).size, 5);
  for (const { id } of THEMES) {
    assert.ok(isTheme(id));
    assert.equal(normalizeTheme(id), id);
  }
  for (const value of [null, undefined, '', 'light', 'dark', 'blue', 'FOREST', '__proto__', 'constructor', {}, 1]) {
    assert.equal(isTheme(value), false);
    assert.equal(normalizeTheme(value), 'forest');
  }
});

test('missing preferences ignore the preview key and use forest', () => {
  assert.notEqual(THEME_KEY, 'pa-preview-theme');
  assert.equal(readTheme(memoryStorage({ 'pa-preview-theme': 'graphite' })), 'forest');
  assert.equal(readTheme(memoryStorage()), 'forest');
});

test('only valid legacy light and dark migrate when the new key is missing', () => {
  assert.equal(readTheme(memoryStorage({ [LEGACY_THEME_KEY]: 'light' })), 'warm');
  assert.equal(readTheme(memoryStorage({ [LEGACY_THEME_KEY]: 'dark' })), 'graphite');
  for (const value of ['warm', 'forest', 'system', 'constructor', '']) {
    assert.equal(readTheme(memoryStorage({ [LEGACY_THEME_KEY]: value })), 'forest');
  }
});

test('new valid and invalid preferences take precedence over legacy values', () => {
  for (const { id } of THEMES) {
    assert.equal(readTheme(memoryStorage({ [THEME_KEY]: id, [LEGACY_THEME_KEY]: 'dark' })), id);
  }
  for (const value of ['', 'unknown', '__proto__', 'dark']) {
    assert.equal(readTheme(memoryStorage({ [THEME_KEY]: value, [LEGACY_THEME_KEY]: 'dark' })), 'forest');
  }
});

test('unavailable storage never prevents reads or in-memory selection', () => {
  const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  assert.equal(readTheme(storage), 'forest');
  assert.equal(readTheme(null), 'forest');
  assert.equal(readTheme(), 'forest');
  assert.equal(persistTheme(storage, 'amber'), 'amber');
  const store = createThemeStore({ storage });
  assert.doesNotThrow(() => store.initialize());
  store.setTheme('violet');
  assert.equal(store.getSnapshot(), 'violet');
});

test('migration and selections write only the independent appearance key', () => {
  const storage = memoryStorage({ theme: 'dark', ledger: 'untouched', token: 'untouched' });
  const store = createThemeStore({ storage });
  store.initialize();
  assert.equal(store.getSnapshot(), 'graphite');
  for (const { id } of THEMES) store.setTheme(id);
  assert.ok(storage.writes.every(([key]) => key === THEME_KEY));
  assert.equal(storage.values.get('theme'), 'dark');
  assert.equal(storage.values.get('ledger'), 'untouched');
  assert.equal(storage.values.get('token'), 'untouched');
  assert.equal(readTheme(storage), 'violet');
});

test('one store synchronizes multiple consumers and unsubscribe is isolated', () => {
  const store = createThemeStore();
  const first: ThemeId[] = [], second: ThemeId[] = [];
  const off = store.subscribe(() => first.push(store.getSnapshot()));
  store.subscribe(() => second.push(store.getSnapshot()));
  store.setTheme('warm');
  store.setTheme('warm');
  store.setTheme('graphite');
  assert.deepEqual(first, ['warm', 'graphite']);
  assert.deepEqual(second, first);
  off();
  store.setTheme('amber');
  assert.deepEqual(first, ['warm', 'graphite']);
  assert.deepEqual(second, ['warm', 'graphite', 'amber']);
});

test('remote changes apply and notify without writing back; deletion and invalid reset', () => {
  const storage = memoryStorage();
  const applied: ThemeId[] = [];
  const store = createThemeStore({ storage, apply: theme => applied.push(theme) });
  let updates = 0;
  store.subscribe(() => updates++);
  store.syncTheme('graphite');
  store.syncTheme('graphite');
  assert.equal(updates, 1);
  store.syncTheme(null);
  assert.equal(store.getSnapshot(), 'forest');
  store.syncTheme('amber');
  store.syncTheme('invalid');
  assert.equal(store.getSnapshot(), 'forest');
  assert.equal(storage.writes.length, 0);
  assert.deepEqual(applied, ['graphite', 'graphite', 'forest', 'amber', 'forest']);
});

test('cross-tab events ignore session storage and unrelated keys', () => {
  const storage = memoryStorage();
  assert.equal(themeFromStorageEvent({ key: THEME_KEY, newValue: 'amber', storageArea: storage }, storage), 'amber');
  assert.equal(themeFromStorageEvent({ key: THEME_KEY, newValue: null, storageArea: storage }, storage), 'forest');
  assert.equal(themeFromStorageEvent({ key: null, newValue: null, storageArea: storage }, storage), 'forest');
  assert.equal(themeFromStorageEvent({ key: THEME_KEY, newValue: 'amber', storageArea: {} }, storage), null);
  for (const key of [LEGACY_THEME_KEY, 'pa-preview-theme', 'transactions', 'settings']) {
    assert.equal(themeFromStorageEvent({ key, newValue: 'graphite', storageArea: storage }, storage), null);
  }
});

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1];
function runBootstrap(storage: ReturnType<typeof memoryStorage>, blocked = false) {
  const classes = new Set(['existing-class']);
  const root = {
    dataset: {} as Record<string, string>, style: {} as Record<string, string>,
    classList: { toggle(name: string, enabled: boolean) { if (enabled) classes.add(name); else classes.delete(name); } },
  };
  const meta = { content: '' };
  const sandbox = { document: { documentElement: root, querySelector: () => meta } };
  Object.defineProperty(sandbox, 'localStorage', { get() { if (blocked) throw Error('blocked'); return storage; } });
  runInNewContext(bootstrap, sandbox);
  return { root, meta, classes };
}

test('pre-paint bootstrap agrees with runtime for every preference and legacy value', () => {
  const values = [null, ...THEMES.map(theme => theme.id), '', 'invalid', '__proto__', 'constructor'];
  for (const saved of values) for (const legacy of [null, 'light', 'dark', 'system']) {
    const data: Record<string, string> = {};
    if (saved !== null) data[THEME_KEY] = saved;
    if (legacy !== null) data[LEGACY_THEME_KEY] = legacy;
    const storage = memoryStorage(data), expected = readTheme(storage);
    const { root, meta, classes } = runBootstrap(storage);
    assert.equal(root.dataset.theme, expected);
    assert.equal(root.style.colorScheme, expected === 'graphite' ? 'dark' : 'light');
    assert.equal(root.style.backgroundColor, THEMES.find(item => item.id === expected)!.canvas);
    assert.equal(meta.content, root.style.backgroundColor);
    assert.equal(classes.has('dark'), expected === 'graphite');
    assert.equal(classes.has('light'), expected !== 'graphite');
    assert.ok(classes.has('existing-class'));
    assert.equal(storage.writes.length, 0);
  }
});

test('pre-paint bootstrap still applies forest when accessing storage throws', () => {
  assert.equal(runBootstrap(memoryStorage(), true).root.dataset.theme, 'forest');
  assert.ok(html.indexOf(bootstrap) < html.indexOf('src="/src/main.tsx"'));
});

const css = readFileSync(new URL('../src/styles/themes.css', import.meta.url), 'utf8');
const palettes = Object.fromEntries([...css.matchAll(/:root\[data-theme="([^"]+)"\]\{([^}]+)\}/g)].map(match => [
  match[1], Object.fromEntries([...match[2].matchAll(/--([\w-]+):([^;]+);/g)].map(token => [token[1], token[2]])),
]));
for (const { id } of THEMES) {
  test(`${id} includes every prototype semantic token and matches control preview`, () => {
    assert.equal(Object.keys(palettes[id]).length, 43);
    assert.deepEqual(Object.keys(palettes[id]).sort(), Object.keys(palettes.forest).sort());
    assert.equal(palettes[id].bg, THEMES.find(item => item.id === id)!.canvas);
    assert.equal(palettes[id].sidebar, THEMES.find(item => item.id === id)!.sidebar);
    assert.equal(palettes[id].accent, THEMES.find(item => item.id === id)!.accent);
  });
}
test('CSS falls back to forest without script and picker keyboard focus stays distinct', () => {
  assert.match(css, /:root, :root\[data-theme="forest"\]/);
  assert.doesNotMatch(css, /:root, :root\[data-theme="warm"\]/);
  assert.match(css, /\.pa-theme-option\[aria-pressed="true"\][^{]*\{[^}]*box-shadow/);
  assert.match(css, /\.pa-theme-picker button:focus-visible[^}]*outline: 3px/);
});
