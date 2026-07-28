import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { HistoryResponseSchema } from '../../src/shared/contracts.js';

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

test('lists active alerts and navigates directly to their closest panel', async ({ page }) => {
  const alertsButton = page.getByRole('button', { name: /WARN · \d+ alerts?/ });
  await expect(alertsButton).toBeVisible();
  await alertsButton.click();
  const alerts = page.locator('#global-alert-menu');
  await expect(alerts).toBeVisible();
  await expect(alerts.getByText('K3sWorkerCapacity')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(alerts).toBeHidden();
  await alertsButton.click();
  await alerts.getByRole('link', { name: /K3sWorkerCapacity/ }).click();
  await expect(page).toHaveURL(/\/kubernetes#k3s-health-title$/);
  await expect(page.locator('#k3s-health-title')).toBeVisible();
  await expect(alerts).toBeHidden();
  await alertsButton.click();
  await page.getByRole('heading', { name: /workload health/ }).click();
  await expect(alerts).toBeHidden();
});

test('renders the responsive indoor dashboard and requires review before controls', async ({ page }) => {
  test.setTimeout(60_000);
  let historyRequestCount = 0;
  const indoorCommands: unknown[] = [];
  const customQueries: URL[] = [];
  await page.route(/\/api\/v1\/history\?/, async (route) => {
    historyRequestCount += 1;
    const url = new URL(route.request().url());
    if (url.searchParams.get('window') === 'custom') customQueries.push(url);
    const metric = url.searchParams.get('metric')!;
    const unit = metric.endsWith('.co2') ? 'ppm' : metric.endsWith('.temperature') ? '°F' : metric.endsWith('.humidity') ? '%' : metric.endsWith('.pm25') || metric.endsWith('.pm10') ? 'µg/m³' : 'index';
    const values = metric.endsWith('.co2') ? [550, 850, 1100] : metric.endsWith('.temperature') ? [70, 72, 71] : metric.endsWith('.humidity') ? [42, 44, 43] : metric.endsWith('.pm25') ? [3, 10, 18] : metric.endsWith('.pm10') ? [5, 14, 24] : [20, 40, 30];
    const body = {
      requestId: 'e2e-history-request',
      data: {
        metric,
        unit,
        window: url.searchParams.get('window'),
        points: values.map((value, index) => ({ timestamp: `2026-07-25T0${index}:00:00.000Z`, value })),
        metadata: { source: 'fixture', observedAt: '2026-07-25T02:00:00.000Z', freshness: 'CURRENT', severity: 'OK' },
      },
    };
    const parsed = HistoryResponseSchema.safeParse(body);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.route('**/api/v1/indoor/actions', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.confirmed).toBe(true);
    indoorCommands.push(body.command);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ data: { actionId: crypto.randomUUID(), target: body.command.target, status: 'PENDING', acceptedAt: new Date().toISOString() } }),
    });
  });
  await page.goto('/indoor');
  await expect(page.getByRole('heading', { name: 'Indoor environment' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AirGradient + Nest' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Living Room Aranet' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Living Room Coway' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bedroom Coway' })).toBeVisible();
  const airGradientSettings = page.getByRole('heading', { name: 'AirGradient settings' });
  const nestSettings = page.getByRole('heading', { name: 'Living Room Nest' });
  await expect(airGradientSettings).toBeVisible();
  await expect(nestSettings).toBeVisible();
  await expect.poll(async () => {
    const [airGradientBox, nestBox] = await Promise.all([airGradientSettings.boundingBox(), nestSettings.boundingBox()]);
    return Math.abs((airGradientBox?.y ?? 0) - (nestBox?.y ?? 1_000));
  }).toBeLessThan(2);
  const ventilate = page.getByRole('button', { name: 'Ventilate', exact: true });
  await expect(ventilate).not.toHaveClass(/ventilate-button-active/);
  await ventilate.click();
  const ventilationReview = page.getByRole('dialog', { name: 'Confirm change' });
  await expect(ventilationReview).toContainText('Both Coways Rapid + Nest fan for 30 minutes');
  await expect(ventilationReview).toContainText('Nest + Coway clouds');
  await ventilationReview.getByRole('button', { name: 'Save' }).click();
  await expect(ventilationReview).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ventilating…' })).toHaveClass(/ventilate-button-active/);
  await expect(page.getByRole('button', { name: 'Ventilating…' })).toBeDisabled();
  await expect(page.getByRole('timer')).toHaveText(/\d{2}:\d{2} remaining/);
  expect(indoorCommands).toContainEqual({ type: 'VENTILATE', target: 'indoor_environment', durationMinutes: 30 });
  await page.getByRole('button', { name: 'Cancel ventilation' }).click();
  const cancellationReview = page.getByRole('dialog', { name: 'Confirm change' });
  await expect(cancellationReview).toContainText('Cancel and restore prior fan states');
  await cancellationReview.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Cancelling…' })).toBeDisabled();
  expect(indoorCommands).toContainEqual({ type: 'CANCEL_VENTILATION', target: 'indoor_environment' });
  await expect.poll(() => historyRequestCount).toBe(7);
  const co2Graph = page.getByRole('img', { name: /CO₂, 1h/ });
  await expect(co2Graph).toBeVisible();
  await co2Graph.hover({ position: { x: 120, y: 60 } });
  await expect(co2Graph.locator('.history-tooltip')).toContainText('ppm');
  await expect(co2Graph.locator('.history-crosshair')).toHaveCount(1);
  await expect(co2Graph.locator('circle')).toHaveCount(0);
  await expect(co2Graph.locator('.history-trace-stop-green')).not.toHaveCount(0);
  await expect(co2Graph.locator('.history-trace-stop-blue')).not.toHaveCount(0);
  await expect(co2Graph.locator('.history-trace-stop-yellow')).not.toHaveCount(0);
  await expect(co2Graph.locator('.history-trace-stop-red')).not.toHaveCount(0);
  const particulateGraph = page.getByRole('img', { name: /AirGradient particulate matter, 1h/ });
  await expect(particulateGraph).toBeVisible();
  await expect(page.locator('.indoor-history-graph figcaption strong')).toHaveText([
    'AirGradient CO₂',
    'AirGradient particulate matter',
    'AirGradient TVOC index',
    'AirGradient NOx index',
    'AirGradient temperature',
    'AirGradient humidity',
  ]);
  await expect(page.getByLabel('AirGradient particulate matter graph legend')).toContainText('PM2.5');
  await expect(page.getByLabel('AirGradient particulate matter graph legend')).toContainText('PM10');
  await expect(particulateGraph.locator('.history-line-secondary')).toHaveCount(1);
  await expect(particulateGraph.locator('.history-line-secondary')).toHaveCSS('stroke-dasharray', '2px, 4px');
  const temperatureGraph = page.getByRole('img', { name: /AirGradient temperature, 1h/ });
  await temperatureGraph.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(temperatureGraph.locator('.history-tooltip-marker-yellow')).toHaveCount(1);
  const temperatureYellowColors = await temperatureGraph.evaluate((graph) => ({
    marker: getComputedStyle(graph.querySelector('.history-tooltip-marker-yellow')!).backgroundColor,
    trace: getComputedStyle(graph.querySelector('.history-trace-stop-yellow')!).stopColor,
  }));
  expect(temperatureYellowColors.marker).toBe(temperatureYellowColors.trace);
  const tvocGraph = page.getByRole('img', { name: /AirGradient TVOC index, 1h/ });
  await tvocGraph.focus();
  await page.keyboard.press('ArrowLeft');
  const tvocBlueColors = await tvocGraph.evaluate((graph) => ({
    marker: getComputedStyle(graph.querySelector('.history-tooltip-marker-blue')!).backgroundColor,
    trace: getComputedStyle(graph.querySelector('.history-trace-stop-blue')!).stopColor,
  }));
  expect(tvocBlueColors.marker).toBe(tvocBlueColors.trace);
  await co2Graph.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(co2Graph.locator('.history-tooltip')).toContainText('ppm');
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByLabel('Last').fill('2');
  await page.locator('.history-custom-range select').selectOption('days');
  await page.getByRole('button', { name: 'Apply to all graphs' }).click();
  await expect.poll(() => historyRequestCount).toBe(14);
  expect(customQueries).toHaveLength(7);
  expect(customQueries.every((url) => url.searchParams.has('start') && url.searchParams.has('end'))).toBe(true);
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByRole('button', { name: 'Start / end' }).click();
  await page.getByLabel('Start').fill('2026-07-24T08:00');
  await page.getByRole('textbox', { name: 'End', exact: true }).fill('2026-07-25T08:00');
  await page.getByRole('button', { name: 'Apply to all graphs' }).click();
  await expect.poll(() => historyRequestCount).toBe(21);
  expect(customQueries).toHaveLength(14);
  expect(await page.evaluate(() => {
    const axis = document.createElement('div');
    axis.className = 'y-axis-labels';
    const number = document.createElement('span');
    number.className = 'y-axis-label';
    number.textContent = '1000';
    axis.append(number);
    document.body.append(axis);
    const fontSize = getComputedStyle(number).fontSize;
    const metricFontSize = getComputedStyle(document.querySelector('.metric-label')!).fontSize;
    axis.remove();
    return { fontSize, metricFontSize };
  })).toEqual({ fontSize: '9.92px', metricFontSize: '9.92px' });
  const hvacModes = page.getByRole('group', { name: 'HVAC mode' });
  const hvacButton = hvacModes.getByRole('button', { name: 'HVAC mode: HEAT_COOL. Show options' });
  await expect(hvacButton).toHaveClass(/control-current-positive/);
  await hvacButton.click();
  await expect(hvacModes.getByRole('menuitemradio')).toHaveCount(4);
  await expect(hvacModes.getByRole('menuitemradio', { name: 'HEAT_COOL' })).toHaveAttribute('aria-checked', 'true');
  await hvacModes.getByRole('menuitemradio', { name: 'OFF' }).click();
  const review = page.getByRole('dialog', { name: 'Confirm change' });
  await expect(review).toBeVisible();
  await expect(review.getByText('Living Room Nest')).toBeVisible();
  await expect(review.getByText('HEAT_COOL')).toBeVisible();
  await expect(review.getByText(/Nest cloud · updates after confirmation/)).toBeVisible();
  await review.getByRole('button', { name: 'Save' }).click();
  await expect(review).toBeHidden();
  expect(indoorCommands).toContainEqual({ type: 'NEST_SET_HVAC_MODE', target: 'nest_living_room', mode: 'OFF' });
  await expect(hvacButton).toContainText('HEAT_COOL');

  const sensitivity = page.getByRole('group', { name: 'Sensitivity' }).first();
  await sensitivity.getByRole('button', { name: 'Sensitivity: NORMAL. Show options' }).click();
  await expect(sensitivity.getByRole('menuitemradio')).toHaveCount(3);
  await expect(sensitivity.getByRole('menuitemradio', { name: 'NORMAL' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');

  const livingCowayPanel = page.getByRole('region', { name: 'Living Room Coway' });
  const cowayTimer = livingCowayPanel.getByRole('group', { name: 'Timer' });
  await cowayTimer.getByRole('button', { name: 'Timer: Off. Show options' }).click();
  await expect(cowayTimer.getByRole('menuitemradio')).toHaveCount(5);
  await page.keyboard.press('Escape');

  const pmStandard = page.getByRole('group', { name: 'PM standard' });
  await pmStandard.getByRole('button', { name: 'PM standard: us aqi. Show options' }).click();
  await expect(pmStandard.getByRole('menuitemradio')).toHaveCount(2);
  await page.keyboard.press('Escape');

  const power = page.getByRole('group', { name: 'Power' }).first();
  await expect(power.getByRole('button', { name: 'Power: On. Show options' })).toHaveClass(/control-current-positive/);
  const light = page.getByRole('group', { name: 'Light' }).first();
  await expect(light.getByRole('button', { name: 'Light: ON. Show options' })).toHaveClass(/control-current-positive/);
});

test('supports indoor keyboard cancellation and has no serious accessibility violations', async ({ page }) => {
  await page.goto('/indoor');
  const power = page.getByRole('group', { name: 'Power' }).first();
  await power.getByRole('button', { name: 'Power: On. Show options' }).focus();
  await page.keyboard.press('Enter');
  await power.getByRole('menuitemradio', { name: 'Off' }).focus();
  await page.keyboard.press('Enter');
  const review = page.getByRole('dialog', { name: 'Confirm change' });
  await expect(review).toBeVisible();
  await expect(review.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(review).toBeHidden();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([]);
});

test('refreshes live history on visibility return and retains graphs after failures', async ({ page }) => {
  let requestCount = 0;
  let failRefresh = false;
  await page.route(/\/api\/v1\/history\?/, async (route) => {
    requestCount += 1;
    if (failRefresh) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE' }, requestId: 'e2e-failed-refresh' }) });
      return;
    }
    const url = new URL(route.request().url());
    const metric = url.searchParams.get('metric')!;
    const unit = metric.endsWith('.co2') ? 'ppm' : metric.endsWith('.temperature') ? '°F' : metric.endsWith('.humidity') ? '%' : 'µg/m³';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'e2e-live-refresh',
        data: {
          metric,
          unit,
          window: url.searchParams.get('window'),
          points: [
            { timestamp: '2026-07-26T08:00:00.000Z', value: metric.endsWith('.co2') ? 700 : 10 },
            { timestamp: '2026-07-26T08:05:00.000Z', value: metric.endsWith('.co2') ? 720 : 11 },
          ],
          metadata: { source: 'fixture', observedAt: '2026-07-26T08:05:00.000Z', freshness: 'CURRENT', severity: 'OK' },
        },
      }),
    });
  });
  await page.goto('/indoor');
  await expect.poll(() => requestCount).toBe(7);
  await expect(page.getByText(/Updated .* PT/)).toBeVisible();
  const co2Graph = page.getByRole('img', { name: /CO₂, 1h/ });
  await expect(co2Graph).toBeVisible();
  failRefresh = true;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => requestCount).toBe(14);
  await expect(page.getByText(/Update failed · retaining data/)).toBeVisible();
  await expect(co2Graph).toBeVisible();

  failRefresh = false;
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByRole('button', { name: 'Start / end' }).click();
  await page.getByLabel('Start').fill('2026-07-24T08:00');
  await page.getByRole('textbox', { name: 'End', exact: true }).fill('2026-07-25T08:00');
  await page.getByRole('button', { name: 'Apply to all graphs' }).click();
  await expect.poll(() => requestCount).toBe(21);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(150);
  expect(requestCount).toBe(21);
});

for (const viewport of [{ name: 'mobile', width: 320, height: 900 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1440, height: 1080 }]) {
  test(`keeps indoor content within the ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/indoor');
    await expect(page.getByRole('heading', { name: 'Indoor environment' })).toBeVisible();
    if (viewport.name === 'mobile') {
      await page.getByRole('button', { name: 'Custom', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Apply to all graphs' })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const viewport of [{ name: 'mobile', width: 320, height: 900 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1440, height: 1080 }]) {
  test(`keeps Kubernetes graphs readable at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/kubernetes');
    const nodeGraphs = page.locator('.k8s-node-graph-grid .dot-graph-trace');
    await expect(nodeGraphs).toHaveCount(6);
    const dimensions = await nodeGraphs.evaluateAll((graphs) => graphs.map((graph) => {
      const bounds = graph.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    }));
    expect(dimensions.every(({ width, height }) => width >= 185 && height >= 25), JSON.stringify(dimensions)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

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
