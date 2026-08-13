import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { HistoryResponseSchema } from '../../src/shared/contracts.js';
import { healthyBootstrapFixture } from '../../src/shared/fixtures.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
});

test('supports keyboard-first search, navigation, and help', async ({ page }) => {
  const search = page.getByRole('textbox', { name: 'Search local dashboard' });
  await page.getByRole('link', { name: 'Overview' }).focus();
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

test('matches OKD node cards to the Proxmox layout with power, load, and per-core detail', async ({ page }) => {
  await page.route('**/api/v1/events', (route) => route.abort());
  await page.route('**/api/v1/bootstrap', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: healthyBootstrapFixture, requestId: 'okd-host-layout-e2e' }),
  }));
  await page.goto('/compute');
  const node = page.locator('.okd-node-card').filter({ has: page.getByRole('heading', { name: 'okd-cp-01', exact: true }) });
  await expect(node.locator('.pve-cpu-summary span').filter({ hasText: /^LOAD/ })).toBeVisible();
  await expect(node.locator('.pve-cpu-summary span').filter({ hasText: /^PWR/ })).toBeVisible();
  await expect(node.getByText('22 W', { exact: true })).toBeVisible();
  await expect(node.locator('.pve-cpu-summary span').filter({ hasText: /^TEMP 45.4°C$/ })).toBeVisible();
  await expect(node.locator('.disk-resource')).toContainText('I/O WAIT 2.6%');
  await expect(node.locator('.network-resource')).toContainText('TOTAL TRANSFER');
  await expect(node.locator('.network-resource')).not.toContainText('N/S');
  await expect(node.locator('.network-resource .traffic-matrix-fixed')).toHaveCount(1);
  await expect(node.locator('.network-resource .traffic-graph-trace')).toHaveAttribute('style', /--traffic-rows: 4/);
  await expect(node.locator('.network-resource .dot-graph')).toHaveCount(0);
  await expect(node.locator('.network-resource .traffic-graph')).toHaveAttribute('aria-label', /Download: .* above midline; upload: .* below midline/);

  await node.getByRole('button', { name: 'Expand details' }).click();

  await expect(node).toHaveClass(/panel-expanded/);
  await expect(node.getByText('LOAD TREND')).toBeVisible();
  await expect(node.locator('.metric').filter({ hasText: /^SWAP/ })).toContainText('0.0 GiB / 0.0 GiB');
  await expect(node.locator('.metric').filter({ hasText: /^CONTAINERS/ })).toContainText('64');
  await expect(node.locator('.metric').filter({ hasText: /^CONTAINERS/ })).toContainText('stopped: 42');
  await expect(node.locator('.metric').filter({ hasText: /^PODS/ })).toContainText('35 / 250');
  await expect(node.locator('.metric').filter({ hasText: /^PODS/ })).toContainText('running / allocatable');
  await expect(node.getByText('CPU CLOCK')).toHaveCount(0);
  await expect(node.getByText('VIRTUAL MACHINES')).toHaveCount(0);
  await expect(node.getByText('NOT SUPPORTED')).toHaveCount(0);
  await expect(node.getByRole('region', { name: 'Per-core CPU utilization' })).toBeVisible();
  await expect(node.getByText('C0', { exact: true })).toBeVisible();
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

test('renders actionable OKD failures without duplicate cluster alerts', async ({ page }) => {
  const bootstrap = structuredClone(healthyBootstrapFixture);
  bootstrap.alerts = [];
  bootstrap.globalSeverity = 'CRIT';
  const cluster = bootstrap.clusters.find((item) => item.id === 'okd')!;
  cluster.metadata = { ...cluster.metadata, severity: 'CRIT', message: 'Specific OKD health causes require attention.' };
  const node = bootstrap.hosts.find((item) => item.kind === 'OKD_NODE')!;
  node.metadata = { ...node.metadata, severity: 'CRIT', message: 'Node is not Ready.' };
  const operator = bootstrap.platformOperators[0]!;
  operator.available = true;
  operator.progressing = false;
  operator.degraded = true;
  operator.metadata = { ...operator.metadata, severity: 'CRIT', message: 'Operator reports a degraded condition.' };
  bootstrap.workloads.push({
    id: 'okd:deployment:apps:broken', name: 'broken', clusterId: 'okd', namespace: 'apps',
    readyReplicas: 0, desiredReplicas: 1, href: null,
    metadata: { ...cluster.metadata, severity: 'WARN', message: 'Workload is not fully ready.' },
  });
  await page.route('**/api/v1/events', (route) => route.abort());
  await page.route('**/api/v1/bootstrap', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: bootstrap, requestId: 'okd-failure-e2e' }),
  }));

  await page.goto('/okd');
  await expect(page.getByRole('heading', { name: 'OKD cluster health' })).toBeVisible();
  await expect(page.getByRole('region', { name: node.name }).getByText('CRIT', { exact: true })).toBeVisible();
  const operatorPanel = page.getByRole('region', { name: operator.name });
  await expect(operatorPanel.locator('.metric').filter({ hasText: 'DEGRADED' }).getByText('YES', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'broken' }).getByText('0 / 1', { exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([]);

  await page.getByRole('button', { name: /CRIT · \d+ alerts?/ }).click();
  const drawer = page.locator('#global-alert-menu');
  await expect(drawer.getByRole('link', { name: new RegExp(operator.name) })).toHaveAttribute('href', '/okd#okd-operators');
  await expect(drawer.getByRole('link', { name: /apps\/broken/ })).toHaveAttribute('href', '/okd#okd-workloads');
  await expect(drawer.getByRole('link', { name: new RegExp(node.name) })).toHaveAttribute('href', '/okd#okd-node-health');
  await expect(drawer.getByRole('link', { name: /^OKD\b/ })).toHaveCount(0);
});

test('shows configured OKD no-data state consistently across public views', async ({ page }) => {
  const bootstrap = structuredClone(healthyBootstrapFixture);
  bootstrap.globalSeverity = 'WARN';
  bootstrap.hosts = bootstrap.hosts.filter((item) => item.kind !== 'OKD_NODE');
  bootstrap.platformOperators = [];
  bootstrap.workloads = bootstrap.workloads.filter((item) => item.clusterId !== 'okd');
  const cluster = bootstrap.clusters.find((item) => item.id === 'okd')!;
  Object.assign(cluster, {
    nodeCount: null, readyNodeCount: null, workloadCount: null, cpuCapacityCores: null,
    cpuUsedCores: null, memoryCapacityBytes: null, memoryUsedBytes: null,
    metadata: { ...cluster.metadata, freshness: 'NO_DATA', severity: 'WARN', message: 'No successful OKD API sample is available.' },
  });
  await page.route('**/api/v1/events', (route) => route.abort());
  await page.route('**/api/v1/bootstrap', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: bootstrap, requestId: 'okd-no-data-e2e' }),
  }));

  await page.goto('/');
  await expect(page.getByRole('region', { name: 'OKD' }).getByText('NO DATA', { exact: true })).toBeVisible();
  await page.goto('/compute');
  await expect(page.getByText('No successful OKD node sample is available.')).toBeVisible();
  await page.goto('/network');
  await expect(page.getByRole('heading', { name: 'OKD endpoints' })).toBeVisible();
  await page.goto('/services');
  await expect(page.getByRole('link', { name: /OKD Console/ })).toBeVisible();
  await page.goto('/okd');
  await expect(page.getByText('No successful ClusterOperator sample is available.')).toBeVisible();
  await expect(page.getByText('No unhealthy OKD workloads currently reported.')).toBeVisible();
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
  const summaryPanel = page.getByRole('region', { name: 'Indoor summary' });
  await expect(summaryPanel).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Summary' })).toHaveCount(0);
  const summaryRowLayout = await summaryPanel.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('.panel-body')!;
    const metrics = element.querySelector<HTMLElement>('.indoor-primary-readings')!.getBoundingClientRect();
    const controls = element.querySelector<HTMLElement>('.indoor-summary-controls')!.getBoundingClientRect();
    return {
      bodyMinHeight: getComputedStyle(body).minHeight,
      columnCount: getComputedStyle(body).gridTemplateColumns.split(' ').length,
      controlsAfterMetrics: controls.left > metrics.right,
    };
  });
  expect(summaryRowLayout.bodyMinHeight).toBe('0px');
  expect(summaryRowLayout.columnCount).toBe(2);
  expect(summaryRowLayout.controlsAfterMetrics).toBe(true);
  await expect(summaryPanel.locator('.state')).toHaveCount(0);
  await expect(summaryPanel.getByRole('button', { name: 'Ventilate', exact: true })).toBeVisible();
  await expect(page.locator('.hero-row').getByRole('button', { name: 'Ventilate', exact: true })).toHaveCount(0);
  await expect(summaryPanel.locator('.metric-indicator')).toHaveCount(7);
  await expect(summaryPanel.getByRole('img', { name: 'PM2.5 trend status: yellow' })).toBeVisible();
  await expect(summaryPanel.getByRole('img', { name: 'TVOC INDEX trend status: blue' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Living Room Aranet' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Living Room Air Purifier', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bedroom Air Purifier', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Device Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Additional Sensor Data' })).toBeVisible();
  const airGradientSettings = page.getByRole('heading', { name: 'AirGradient ONE' });
  const nestSettings = page.getByRole('heading', { name: 'Nest Thermostat' });
  await expect(airGradientSettings).toBeVisible();
  await expect(nestSettings).toBeVisible();
  await expect(page.getByText('AVAILABLE', { exact: true })).toHaveCount(0);
  await expect(page.getByText('CURRENT', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Nest Thermostat' }).locator('.panel-state-detail')).toHaveText('68–74°F · HEAT_COOL');
  await expect(page.getByRole('region', { name: 'Living Room Air Purifier', exact: true }).locator('.panel-state-detail')).toHaveText('ON · AUTO · SPEED 2 · PRE-FILTER 91% · HEPA 83%');
  const aranetPanel = page.getByRole('region', { name: 'Living Room Aranet' });
  const purifierPanels = [page.getByRole('region', { name: 'Living Room Air Purifier', exact: true }), page.getByRole('region', { name: 'Bedroom Air Purifier', exact: true })];
  const purifierSensorPanels = [page.getByRole('region', { name: 'Living Room Air Purifier Sensor Data' }), page.getByRole('region', { name: 'Bedroom Air Purifier Sensor Data' })];
  for (const panel of purifierPanels) await expect(panel.locator('.indoor-reading-grid')).toHaveCount(0);
  for (const panel of purifierSensorPanels) {
    await expect(panel).toBeVisible();
    for (const label of ['PM2.5', 'PM10', 'AQI', 'PRE-FILTER', 'HEPA FILTER']) await expect(panel.getByText(label, { exact: true })).toBeVisible();
  }
  const aranetLayout = await aranetPanel.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    bodyMinHeight: getComputedStyle(element.querySelector<HTMLElement>('.panel-body')!).minHeight,
  }));
  const purifierBottoms = await Promise.all(purifierPanels.map((panel) => panel.evaluate((element) => element.getBoundingClientRect().bottom)));
  const additionalSensorHeights = await Promise.all([...purifierSensorPanels, aranetPanel].map((panel) => panel.evaluate((element) => element.getBoundingClientRect().height)));
  expect(aranetLayout.top).toBeGreaterThan(Math.max(...purifierBottoms));
  expect(aranetLayout.bodyMinHeight).toBe('0px');
  expect(Math.max(...additionalSensorHeights) - Math.min(...additionalSensorHeights)).toBeLessThan(2);
  expect(await airGradientSettings.evaluate((element) => element.closest('.panel')?.parentElement?.classList.contains('indoor-settings-grid'))).toBe(true);
  expect(await nestSettings.evaluate((element) => element.closest('.panel')?.parentElement?.classList.contains('indoor-settings-grid'))).toBe(true);
  const thermostatControls = page.getByRole('region', { name: 'Nest Thermostat' }).locator('.thermostat-controls');
  const thermostatLayout = await thermostatControls.evaluate((element) => {
    const optionRow = element.querySelector<HTMLElement>('.thermostat-option-row')!;
    const setpointRange = element.querySelector<HTMLElement>('.nest-setpoint-range')!;
    return {
      overflow: element.scrollWidth - element.clientWidth,
      controlDisplay: getComputedStyle(element).display,
      optionDisplay: getComputedStyle(optionRow).display,
      optionCount: optionRow.children.length,
      setpointIsFirst: element.firstElementChild === setpointRange,
      optionsAreSecond: element.children[1] === optionRow,
    };
  });
  expect(thermostatLayout.overflow).toBeLessThanOrEqual(1);
  expect(thermostatLayout.controlDisplay).toBe('grid');
  expect(thermostatLayout.optionDisplay).toBe('grid');
  expect(thermostatLayout.optionCount).toBe(2);
  expect(thermostatLayout.setpointIsFirst).toBe(true);
  expect(thermostatLayout.optionsAreSecond).toBe(true);
  const nestSetpointTrack = thermostatControls.locator('.nest-setpoint-track');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(nestSetpointTrack).toHaveClass(/nest-setpoint-track-inactive/);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(nestSetpointTrack).not.toHaveClass(/nest-setpoint-track-inactive/);
  const airGradientControls = page.getByRole('region', { name: 'AirGradient ONE' }).locator('.airgradient-controls');
  await expect(airGradientControls.getByRole('slider', { name: 'Display brightness' })).toBeVisible();
  await expect(airGradientControls.getByRole('slider', { name: 'LED brightness' })).toBeVisible();
  await expect(airGradientControls.locator('.airgradient-slider-thumb')).toHaveCount(2);
  await expect(airGradientControls.locator('.airgradient-slider-thumb')).toHaveText(['80%', '60%']);
  await expect(airGradientControls.locator('output')).toHaveCount(0);
  const handleStyleProperties = ['width', 'height', 'boxSizing', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRadius', 'backgroundColor', 'boxShadow', 'fontWeight', 'translate'] as const;
  const [airGradientHandleStyle, nestHandleStyle] = await Promise.all([
    airGradientControls.locator('.airgradient-slider-thumb').first().evaluate((element, properties) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map((property) => [property, style[property]]));
    }, handleStyleProperties),
    thermostatControls.locator('.nest-setpoint-thumb').first().evaluate((element, properties) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map((property) => [property, style[property]]));
    }, handleStyleProperties),
  ]);
  expect(nestHandleStyle).toEqual(airGradientHandleStyle);
  const airGradientLayout = await airGradientControls.evaluate((element) => {
    const rows = [...element.children];
    return {
      controlDisplay: getComputedStyle(element).display,
      rowDisplays: rows.map((row) => getComputedStyle(row).display),
      rowControlCounts: rows.map((row) => row.children.length),
    };
  });
  expect(airGradientLayout.controlDisplay).toBe('grid');
  expect(airGradientLayout.rowDisplays).toEqual(['grid', 'grid']);
  expect(airGradientLayout.rowControlCounts).toEqual([2, 3]);
  for (const panelName of ['AirGradient ONE', 'Nest Thermostat']) {
    const panel = page.getByRole('region', { name: panelName });
    await expect(panel.locator('.panel-footer')).toBeHidden();
  }
  const displayBrightness = airGradientControls.getByRole('slider', { name: 'Display brightness' });
  await displayBrightness.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => indoorCommands.some((command) => JSON.stringify(command) === JSON.stringify({ type: 'AIRGRADIENT_SET_DISPLAY_BRIGHTNESS', target: 'airgradient_living_room', value: 81 }))).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Confirm change' })).toHaveCount(0);
  const nestSettingsPanel = page.getByRole('region', { name: 'Nest Thermostat' });
  const nestHeatSetpoint = nestSettingsPanel.getByRole('slider', { name: /Nest heat setpoint/ });
  const nestCoolSetpoint = nestSettingsPanel.getByRole('slider', { name: /Nest cool setpoint/ });
  await expect(nestHeatSetpoint).toBeVisible();
  await expect(nestCoolSetpoint).toBeVisible();
  await nestHeatSetpoint.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => indoorCommands.some((command) => JSON.stringify(command) === JSON.stringify({ type: 'NEST_SET_SETPOINT', target: 'nest_living_room', setpoint: { shape: 'RANGE', heatTemperatureF: 69, coolTemperatureF: 74 } }))).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Confirm change' })).toHaveCount(0);
  const ventilate = page.getByRole('button', { name: 'Ventilate', exact: true });
  await expect(ventilate).not.toHaveClass(/ventilate-button-active/);
  await ventilate.click();
  const ventilationReview = page.getByRole('dialog', { name: 'Confirm change' });
  await expect(ventilationReview).toContainText('Coways Rapid + Nest fan when available for 30 minutes');
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
  const co2IndicatorColor = await summaryPanel.getByRole('img', { name: 'CO₂ trend status: green' }).evaluate((indicator) => getComputedStyle(indicator).backgroundColor);
  const graphGreen = await co2Graph.locator('.history-trace-stop-green').first().evaluate((stop) => getComputedStyle(stop).stopColor);
  expect(co2IndicatorColor).toBe(graphGreen);
  const particulateGraph = page.getByRole('img', { name: /Particulate matter, 1h/ });
  await expect(particulateGraph).toBeVisible();
  await expect(page.locator('.indoor-history-graph figcaption strong')).toHaveText([
    'CO₂',
    'Particulate matter',
    'TVOC index',
    'NOx index',
    'Temperature',
    'Humidity',
  ]);
  await expect(page.getByText(/Updated .* PT · Data Source: AirGradient/)).toBeVisible();
  await expect(page.getByLabel('Particulate matter graph legend')).toContainText('PM2.5');
  await expect(page.getByLabel('Particulate matter graph legend')).toContainText('PM10');
  await expect(particulateGraph.locator('.history-line-secondary')).toHaveCount(1);
  await expect(particulateGraph.locator('.history-line-secondary')).toHaveCSS('stroke-dasharray', '2px, 4px');
  const pmIndicatorColor = await summaryPanel.getByRole('img', { name: 'PM2.5 trend status: yellow' }).evaluate((indicator) => getComputedStyle(indicator).backgroundColor);
  const graphYellow = await particulateGraph.locator('.history-trace-stop-yellow').first().evaluate((stop) => getComputedStyle(stop).stopColor);
  expect(pmIndicatorColor).toBe(graphYellow);
  const temperatureGraph = page.getByRole('img', { name: /Temperature, 1h/ });
  await temperatureGraph.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(temperatureGraph.locator('.history-tooltip-marker-yellow')).toHaveCount(1);
  const temperatureYellowColors = await temperatureGraph.evaluate((graph) => ({
    marker: getComputedStyle(graph.querySelector('.history-tooltip-marker-yellow')!).backgroundColor,
    trace: getComputedStyle(graph.querySelector('.history-trace-stop-yellow')!).stopColor,
  }));
  expect(temperatureYellowColors.marker).toBe(temperatureYellowColors.trace);
  const tvocGraph = page.getByRole('img', { name: /TVOC index, 1h/ });
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
  const hvacModes = page.getByRole('group', { name: 'Mode' });
  const hvacButton = hvacModes.getByRole('button', { name: 'Mode: HEAT_COOL. Show options' });
  await expect(hvacButton).toHaveClass(/control-current-positive/);
  await hvacButton.click();
  await expect(hvacModes.getByRole('menuitemradio')).toHaveCount(4);
  await expect(hvacModes.getByRole('menuitemradio', { name: 'HEAT_COOL' })).toHaveAttribute('aria-checked', 'true');
  await hvacModes.getByRole('menuitemradio', { name: 'OFF' }).click();
  const review = page.getByRole('dialog', { name: 'Confirm change' });
  await expect(review).toBeVisible();
  await expect(review.getByText('Nest Thermostat')).toBeVisible();
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

  const livingCowayPanel = page.getByRole('region', { name: 'Living Room Air Purifier', exact: true });
  const cowayTimer = livingCowayPanel.getByRole('group', { name: 'Timer' });
  await cowayTimer.getByRole('button', { name: 'Timer: Off. Show options' }).click();
  await expect(cowayTimer.getByRole('menuitemradio')).toHaveCount(5);
  await page.keyboard.press('Escape');

  const pmStandard = page.getByRole('group', { name: 'PM standard' });
  await pmStandard.getByRole('button', { name: 'PM standard: US AQI. Show options' }).click();
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
    await expect(page.locator('.k8s-node-graph-grid .dot-graph-trace .dot-matrix-fixed')).toHaveCount(6);
    await expect(page.locator('.k8s-node-graph-grid .braille-cell')).toHaveCount(0);
    const dimensions = await nodeGraphs.evaluateAll((graphs) => graphs.map((graph) => {
      const bounds = graph.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    }));
    expect(dimensions.every(({ width, height }) => width >= 185 && height >= 25), JSON.stringify(dimensions)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('uses fixed-pitch dot matrices for resource graphs on every telemetry page', async ({ page }) => {
  for (const route of ['/', '/compute', '/kubernetes', '/network']) {
    await page.goto(route);
    const resourceGraphs = page.locator('.dot-graph');
    await expect.poll(() => resourceGraphs.count(), { message: `resource graphs on ${route}` }).toBeGreaterThan(0);
    const graphCount = await resourceGraphs.count();
    await expect(page.locator('.dot-graph .dot-matrix-fixed')).toHaveCount(graphCount);
    await expect(page.locator('.dot-graph .braille-cell')).toHaveCount(0);
  }

  await expect(page.locator('.traffic-graph .traffic-matrix-fixed')).toHaveCount(1);
  await expect(page.locator('.traffic-graph .braille-cell')).toHaveCount(0);
});

test('uses mirrored midline traffic graphs on every Proxmox card', async ({ page }) => {
  for (const route of ['/', '/compute']) {
    await page.goto(route);
    const cards = page.locator('.proxmox-card');
    await expect(cards).toHaveCount(2);
    await expect(page.locator('.proxmox-card .network-resource .traffic-matrix-fixed')).toHaveCount(2);
    await expect(page.locator('.proxmox-card .network-resource .dot-graph')).toHaveCount(0);
  }
});

test('uses saturated semantic colors only on graph dots', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Appearance' }).selectOption('dark');
  const colors = await page.locator('.pve-card').first().evaluate((card) => {
    const color = (selector: string) => getComputedStyle(card.querySelector(selector)!).color;
    const fill = (selector: string) => getComputedStyle(card.querySelector(selector)!).fill;
    return {
      neutral: color('.pve-resource p'),
      text: [
        ...card.querySelectorAll<HTMLElement>('.dot-graph small, .traffic-graph > small span'),
      ].map((element) => getComputedStyle(element).color),
      cpu: fill('.dot-graph-cpu .dot-matrix-level-low'),
      memory: fill('.memory-resource .dot-matrix-level-low'),
      disk: fill('.disk-resource .dot-matrix-level-low'),
      download: fill('.traffic-matrix-download-low'),
      upload: fill('.traffic-matrix-upload-low'),
    };
  });

  expect(colors.text.every((color) => color === colors.neutral), JSON.stringify(colors)).toBe(true);
  expect(colors.cpu).toBe('rgb(52, 211, 153)');
  expect(colors.memory).toBe('rgb(217, 75, 98)');
  expect(colors.disk).toBe('rgb(199, 138, 22)');
  expect(colors.download).toBe('rgb(38, 59, 158)');
  expect(colors.upload).toBe('rgb(149, 36, 157)');
});

test('renders network traffic as dot bars growing outward from the midline', async ({ page }) => {
  const bootstrap = structuredClone(healthyBootstrapFixture);
  const baseSeries = bootstrap.timeSeries[0]!;
  const values = [18, 72, 42, 95, 28, 64];
  const points = values.map((value, index) => ({ timestamp: `2026-07-19T11:${30 + (index * 5)}:00.000Z`, value }));
  bootstrap.timeSeries = [
    ...bootstrap.timeSeries,
    { ...baseSeries, metric: 'pve-01 RX', unit: 'Mb/s', points },
    { ...baseSeries, metric: 'pve-01 TX', unit: 'Mb/s', points: points.map((point) => ({ ...point, value: point.value / 2 })) },
  ];
  await page.route('**/api/v1/events', (route) => route.abort());
  await page.route('**/api/v1/bootstrap', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: bootstrap }),
  }));
  await page.goto('/network');

  const graph = page.getByRole('img', { name: /Download: .* above midline; upload: .* below midline/ });
  await expect.poll(() => graph.locator('.traffic-matrix-column-download').count()).toBeGreaterThan(values.length);
  await expect.poll(() => graph.locator('.traffic-matrix-column-upload').count()).toBeGreaterThan(values.length);
  const geometry = await graph.locator('.traffic-matrix-fixed').evaluate((svg) => {
    const center = svg.getBoundingClientRect().height / 2;
    const centers = (selector: string) => [...svg.querySelectorAll<SVGCircleElement>(selector)].map((dot) => dot.cy.baseVal.value);
    return { center, download: centers('[class^="traffic-matrix-download-"]'), upload: centers('[class^="traffic-matrix-upload-"]') };
  });
  expect(Math.max(...geometry.download)).toBeLessThan(geometry.center);
  expect(Math.min(...geometry.upload)).toBeGreaterThan(geometry.center);
});

test('matches the network traffic overview reference', async ({ page }) => {
  const bootstrap = structuredClone(healthyBootstrapFixture);
  const baseSeries = bootstrap.timeSeries[0]!;
  const values = [18, 72, 42, 95, 28, 64];
  const points = values.map((value, index) => ({ timestamp: `2026-07-19T11:${30 + (index * 5)}:00.000Z`, value }));
  bootstrap.timeSeries = [
    ...bootstrap.timeSeries,
    { ...baseSeries, metric: 'pve-01 RX', unit: 'Mb/s', points },
    { ...baseSeries, metric: 'pve-01 TX', unit: 'Mb/s', points: points.map((point) => ({ ...point, value: point.value / 2 })) },
  ];
  await page.route('**/api/v1/events', (route) => route.abort());
  await page.route('**/api/v1/bootstrap', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: bootstrap }),
  }));
  await page.goto('/network');
  await expect.poll(() => page.locator('.traffic-matrix-column-download').count()).toBeGreaterThan(values.length);
  await expect(page.locator('.network-throughput')).toHaveScreenshot('network-throughput-midline.png', { animations: 'disabled' });
});

for (const viewport of [
  { name: 'mobile', width: 320, height: 900, columns: 1 },
  { name: 'tablet', width: 768, height: 1024, columns: 2 },
  { name: 'desktop', width: 1440, height: 1080, columns: 4 },
]) {
  test(`lays out the overview summaries in ${viewport.columns} column${viewport.columns === 1 ? '' : 's'} at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const summaries = page.locator('.overview-summary-grid > .panel');
    await expect(summaries).toHaveCount(5);
    const topEdges = await summaries.evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().top)));
    expect(new Set(topEdges.slice(0, viewport.columns)).size).toBe(1);
    if (viewport.columns < 5) expect(topEdges[viewport.columns]).toBeGreaterThan(topEdges[0]!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Services', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'OKD', exact: true })).toHaveCount(1);
    const cpuGraphs = page.locator('.pve-cpu-region .dot-graph-fill-width .dot-graph-trace');
    await expect(cpuGraphs).toHaveCount(2);
    const graphCoverage = await cpuGraphs.evaluateAll((graphs) => graphs.map((graph) => {
      const bounds = graph.getBoundingClientRect();
      const graphContainer = graph.closest('.dot-graph')!.getBoundingClientRect();
      const cpuRegion = graph.closest('.pve-cpu-region')!.getBoundingClientRect();
      const columns = [...graph.querySelectorAll('.dot-matrix-column')];
      const first = columns[0]?.getBoundingClientRect();
      const last = columns.at(-1)?.getBoundingClientRect();
      return {
        start: first ? (first.left - bounds.left) / bounds.width : 1,
        end: last ? (last.right - bounds.left) / bounds.width : 0,
        contained: bounds.left >= graphContainer.left && bounds.right <= graphContainer.right,
        outerContained: graphContainer.left >= cpuRegion.left && graphContainer.right <= cpuRegion.right,
        widths: [bounds.width, graphContainer.width, cpuRegion.width],
      };
    }));
    expect(graphCoverage.every(({ start, end }) => start <= 0.03 && end >= 0.98), JSON.stringify(graphCoverage)).toBe(true);
    expect(graphCoverage.every(({ contained }) => contained), JSON.stringify(graphCoverage)).toBe(true);
    expect(graphCoverage.every(({ outerContained }) => outerContained), JSON.stringify(graphCoverage)).toBe(true);
  });
}

for (const viewport of [{ name: 'mobile', width: 320, height: 900 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1440, height: 1080 }]) {
  for (const appearance of ['dark', 'light'] as const) {
    test(`matches the ${appearance} overview at ${viewport.name} width`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), ['homelab-appearance', appearance]);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-appearance', appearance);
      await expect.poll(() => page.locator('.dot-matrix-fixed .dot-matrix-column').first().count()).toBe(1);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page).toHaveScreenshot(`overview-${appearance}-${viewport.name}.png`, { fullPage: true, animations: 'disabled', mask: [page.locator('.header-status')] });
    });
  }
}
