export const UI_THEME_STORAGE_KEY = 'demo_ui_theme';
export const DEFAULT_UI_THEME = 'aliyun' as const;

export const UI_THEMES = ['aliyun', 'kibana'] as const;
export type UiTheme = (typeof UI_THEMES)[number];

export function isUiTheme(value: unknown): value is UiTheme {
  return typeof value === 'string' && (UI_THEMES as readonly string[]).includes(value);
}

export function resolveUiTheme(value: unknown): UiTheme {
  return isUiTheme(value) ? value : DEFAULT_UI_THEME;
}

export function applyUiTheme(theme: UiTheme, root: HTMLElement = document.documentElement): void {
  root.setAttribute('data-ui-theme', theme);
}

export function readStoredUiTheme(storage: Storage = window.localStorage): UiTheme {
  return resolveUiTheme(storage.getItem(UI_THEME_STORAGE_KEY));
}

export function storeUiTheme(theme: UiTheme, storage: Storage = window.localStorage): void {
  storage.setItem(UI_THEME_STORAGE_KEY, theme);
}
