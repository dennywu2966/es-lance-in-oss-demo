import React from 'react';
import { render, screen } from '@testing-library/react';

import { SiteNav } from '@/components/site/site-nav';

describe('SiteNav', () => {
  it('shows core IA navigation links and language toggle', () => {
    render(React.createElement(SiteNav, { lang: 'en' }));

    expect(screen.getByRole('link', { name: /core flow/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /solutions/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /中文/i })).toBeInTheDocument();
  });

  it('renders Chinese labels in zh mode', () => {
    render(React.createElement(SiteNav, { lang: 'zh' }));

    expect(screen.getByRole('link', { name: /核心流程/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /场景与价值/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /EN/i })).toBeInTheDocument();
  });

  it('maps language toggle to matching page in the other locale', () => {
    render(React.createElement(SiteNav, { lang: 'en', section: 'core-flow' }));

    const zhToggle = screen.getByRole('link', { name: /中文/i });
    expect(zhToggle).toHaveAttribute('href', '/zh/core-flow');
  });

  it('maps zh language toggle back to english solutions page', () => {
    render(React.createElement(SiteNav, { lang: 'zh', section: 'solutions' }));

    const enToggle = screen.getByRole('link', { name: /^EN$/i });
    expect(enToggle).toHaveAttribute('href', '/solutions');
  });

  it('uses language-aware docs link in english nav', () => {
    render(React.createElement(SiteNav, { lang: 'en', section: 'home' }));

    const docsLink = screen.getByRole('link', { name: /^Docs$/i });
    expect(docsLink).toHaveAttribute('href', '/docs?lang=en');
  });

  it('uses language-aware docs link in chinese nav', () => {
    render(React.createElement(SiteNav, { lang: 'zh', section: 'home' }));

    const docsLink = screen.getByRole('link', { name: /^文档$/i });
    expect(docsLink).toHaveAttribute('href', '/docs?lang=zh');
  });
});
