"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  DEFAULT_UI_THEME,
  applyUiTheme,
  readStoredUiTheme,
  storeUiTheme,
  type UiTheme,
} from '@/lib/ui-theme';

interface UiThemeContextValue {
  theme: UiTheme;
  setTheme: (theme: UiTheme) => void;
}

const UiThemeContext = createContext<UiThemeContextValue | null>(null);

export function UiThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<UiTheme>(DEFAULT_UI_THEME);

  useEffect(() => {
    const stored = readStoredUiTheme();
    setThemeState(stored);
    applyUiTheme(stored);
  }, []);

  const setTheme = useCallback((nextTheme: UiTheme) => {
    setThemeState(nextTheme);
    applyUiTheme(nextTheme);
    storeUiTheme(nextTheme);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>;
}

export function useUiTheme() {
  const context = useContext(UiThemeContext);
  if (!context) {
    throw new Error('useUiTheme must be used inside UiThemeProvider');
  }
  return context;
}
