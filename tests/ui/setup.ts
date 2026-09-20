import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach } from 'vitest';

afterEach(cleanup);

// Minimal <dialog> support for environments that lack showModal/close.
const proto = globalThis.HTMLDialogElement?.prototype;
if (proto && typeof proto.showModal !== 'function') {
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

/**
 * Run axe on a rendered container. `color-contrast` needs real layout (not available in jsdom); contrast is
 * verified separately, token by token, in tests/unit/design-tokens.test.ts.
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
}
