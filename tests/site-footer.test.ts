import React from 'react';
import { render, screen } from '@testing-library/react';

import { SiteFooter } from '@/components/site/site-footer';

describe('SiteFooter', () => {
  it('renders english footer links', () => {
    render(React.createElement(SiteFooter, { lang: 'en' }));

    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /core flow/i })).toHaveAttribute('href', '/core-flow');
    expect(screen.getByRole('link', { name: /solutions/i })).toHaveAttribute('href', '/solutions');
    expect(screen.getByRole('link', { name: /^Docs$/i })).toHaveAttribute('href', '/docs?lang=en');
  });

  it('renders chinese footer links', () => {
    render(React.createElement(SiteFooter, { lang: 'zh' }));

    expect(screen.getByRole('link', { name: /首页/i })).toHaveAttribute('href', '/zh');
    expect(screen.getByRole('link', { name: /核心流程/i })).toHaveAttribute('href', '/zh/core-flow');
    expect(screen.getByRole('link', { name: /场景与价值/i })).toHaveAttribute('href', '/zh/solutions');
    expect(screen.getByRole('link', { name: /^文档$/i })).toHaveAttribute('href', '/docs?lang=zh');
  });
});
