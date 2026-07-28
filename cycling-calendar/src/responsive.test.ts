import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/styles.css', 'utf8');

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(foreground: string, background: string) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe('responsive safeguards', () => {
  it('defines desktop-to-tablet and stacked-mobile breakpoints', () => {
    expect(styles).toContain('@media (max-width: 1000px)');
    expect(styles).toContain('@media (max-width: 720px)');
    expect(styles).toMatch(
      /\.race-row\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*1fr 1fr;/,
    );
  });

  it('prevents page overflow and protects long calendar content', () => {
    expect(styles).toMatch(/body\s*\{[\s\S]*?overflow-x:\s*clip;/);
    expect(styles).toMatch(/\.race-name > span:first-child,[\s\S]*?overflow-wrap:\s*anywhere;/);
  });

  it('preserves touch targets, visible focus and reduced motion', () => {
    expect(styles).toMatch(/\.filter-field select\s*\{[\s\S]*?min-height:\s*44px;/);
    expect(styles).toMatch(/:focus-visible/);
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toMatch(/scroll-behavior:\s*auto;/);
  });

  it('keeps the core small-text palette above WCAG AA contrast', () => {
    expect(contrast('#171815', '#f0ece2')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#5f605b', '#f0ece2')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#c92f18', '#f0ece2')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ff7c5c', '#171815')).toBeGreaterThanOrEqual(4.5);
  });
});
