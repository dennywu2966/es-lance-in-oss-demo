import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UI_THEME_STORAGE_KEY } from '@/lib/ui-theme';
import { UiThemeProvider } from '@/components/theme/ui-theme-provider';
import { UiThemeSwitcher } from '@/components/theme/ui-theme-switcher';

describe('UiThemeSwitcher', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-ui-theme');
    window.localStorage.clear();
  });

  it('uses aliyun as default theme and lets user switch to kibana', async () => {
    const user = userEvent.setup();

    render(
      React.createElement(
        UiThemeProvider,
        null,
        React.createElement(UiThemeSwitcher)
      )
    );

    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('aliyun');
    expect(window.localStorage.getItem(UI_THEME_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole('button', { name: /kibana 9.x/i }));

    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('kibana');
    expect(window.localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe('kibana');
  });
});
