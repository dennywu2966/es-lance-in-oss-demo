import {
  DEFAULT_UI_THEME,
  UI_THEME_STORAGE_KEY,
  applyUiTheme,
  readStoredUiTheme,
  resolveUiTheme,
  storeUiTheme,
  type UiTheme,
} from '@/lib/ui-theme';

describe('ui theme utilities', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-ui-theme');
    window.localStorage.clear();
  });

  it('defaults to aliyun for undefined or invalid values', () => {
    expect(resolveUiTheme(undefined)).toBe(DEFAULT_UI_THEME);
    expect(resolveUiTheme('unknown-theme')).toBe(DEFAULT_UI_THEME);
  });

  it('resolves known theme values', () => {
    expect(resolveUiTheme('aliyun')).toBe('aliyun');
    expect(resolveUiTheme('kibana')).toBe('kibana');
  });

  it('stores and reads theme from localStorage', () => {
    const theme: UiTheme = 'kibana';
    storeUiTheme(theme);

    expect(window.localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe('kibana');
    expect(readStoredUiTheme()).toBe('kibana');
  });

  it('writes the theme attribute to html root', () => {
    applyUiTheme('aliyun');
    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('aliyun');

    applyUiTheme('kibana');
    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('kibana');
  });
});
