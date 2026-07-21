import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
});

test('supports keyboard-first search, navigation, and help', async ({ page }) => {
  const search = page.getByRole('textbox', { name: 'Search local dashboard' });
  await page.keyboard.press('/');
  await expect(search).toBeFocused();
  await search.fill('keyboard help');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Keyboard help' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard help' })).toBeHidden();

  await page.getByRole('link', { name: 'Network' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/network$/);
});

test('persists accessible theme and layout controls without a mouse', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Appearance' }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');

  await page.getByRole('button', { name: 'Customize dashboard layout' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Customize dashboard layout' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Density').selectOption('comfortable');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.locator('.app-frame')).toHaveClass(/layout-density-comfortable/);
});

test('expands Proxmox cards independently without opening an overlay', async ({ page }) => {
  const pve01 = page.locator('.pve-card').filter({ has: page.getByRole('heading', { name: 'pve-01', exact: true }) });
  const pve02 = page.locator('.pve-card').filter({ has: page.getByRole('heading', { name: 'pve-02', exact: true }) });
  const pve02Height = await pve02.evaluate((element) => element.getBoundingClientRect().height);

  await pve01.getByRole('button', { name: 'Expand details' }).click();

  await expect(pve01).toHaveClass(/panel-expanded/);
  await expect(pve01.getByText('HOST DRILL-DOWN')).toBeVisible();
  await expect(pve01.getByRole('region', { name: 'Per-core CPU utilization' })).toBeVisible();
  await expect(pve01).toHaveScreenshot('pve-expanded-core-monitor.png', { animations: 'disabled' });
  await expect(pve02).not.toHaveClass(/panel-expanded/);
  await expect(pve02.getByText('HOST DRILL-DOWN')).toHaveCount(0);
  await expect(page.locator('.drawer')).toHaveCount(0);
  await expect.poll(() => pve02.evaluate((element) => element.getBoundingClientRect().height)).toBe(pve02Height);

  await pve02.getByRole('button', { name: 'Expand details' }).click();

  await expect(pve01).toHaveClass(/panel-expanded/);
  await expect(pve02).toHaveClass(/panel-expanded/);
  await expect(pve01.getByText('HOST DRILL-DOWN')).toBeVisible();
  await expect(pve02.getByText('HOST DRILL-DOWN')).toBeVisible();
});

test('has no serious or critical automated accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical');
  expect(serious).toEqual([]);
});

for (const viewport of [{ name: 'mobile', width: 320, height: 900 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1440, height: 1080 }]) {
  for (const appearance of ['dark', 'light'] as const) {
    test(`matches the ${appearance} overview at ${viewport.name} width`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), ['homelab-appearance', appearance]);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-appearance', appearance);
      await expect(page).toHaveScreenshot(`overview-${appearance}-${viewport.name}.png`, { fullPage: true, animations: 'disabled', mask: [page.locator('.header-status')] });
    });
  }
}
