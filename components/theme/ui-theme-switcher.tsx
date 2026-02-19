"use client";

import { type UiTheme } from '@/lib/ui-theme';
import { useUiTheme } from './ui-theme-provider';

const THEME_OPTIONS: Array<{ value: UiTheme; label: string }> = [
  { value: 'aliyun', label: 'Aliyun' },
  { value: 'kibana', label: 'Kibana 9.x' },
];

export function UiThemeSwitcher() {
  const { theme, setTheme } = useUiTheme();

  return (
    <div className="fixed bottom-4 right-4 z-[120]">
      <div className="ui-theme-switcher rounded-full border px-2 py-1.5 shadow-lg backdrop-blur-md">
        <div className="mb-1 flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
          <span aria-hidden="true">◐</span>
          <span>Theme</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {THEME_OPTIONS.map((option) => {
            const active = option.value === theme;
            return (
              <button
                key={option.value}
                type="button"
                className={`ui-theme-option rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active ? 'ui-theme-option-active' : 'ui-theme-option-idle'
                }`}
                onClick={() => setTheme(option.value)}
              >
                <span className="inline-flex items-center gap-1">
                  {option.value === 'kibana' ? <span aria-hidden="true">▦</span> : null}
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
