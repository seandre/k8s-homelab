import axe from 'axe-core';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('accessibility', () => {
  it('has no detectable semantic accessibility violations', async () => {
    const { container } = render(<App />);
    const results = await axe.run(container, {
      rules: {
        // JSDOM does not calculate rendered foreground/background colors.
        'color-contrast': { enabled: false },
      },
    });

    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });
});
