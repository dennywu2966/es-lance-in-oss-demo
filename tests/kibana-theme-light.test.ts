/**
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

describe('kibana theme token contract', () => {
  it('uses light background and dark text tokens for kibana theme', () => {
    const cssPath = path.join(process.cwd(), 'app', 'globals.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    const kibanaBlockMatch = css.match(/:root\[data-ui-theme='kibana'\]\s*\{([\s\S]*?)\}/);
    expect(kibanaBlockMatch).toBeTruthy();

    const kibanaBlock = kibanaBlockMatch?.[1] || '';
    expect(kibanaBlock).toContain('--ui-bg-rgb: 249 251 253;');
    expect(kibanaBlock).toContain('--ui-surface-rgb: 255 255 255;');
    expect(kibanaBlock).toContain('--ui-text-rgb: 28 38 56;');
  });
});
