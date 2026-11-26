import { test, expect } from '@playwright/test';

test.describe('Milestone 10: Scenario Simulator & Branch Sandbox', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#scenarios');
    await page.waitForLoadState('networkidle');
  });

  test('loads scenario simulator with authoritative twin immutability shield and baseline scorecard', async ({ page }) => {
    // 1. Verify Page Title and Milestone 10 Badges
    await expect(page.getByText('What-If Scenario Simulator & Branch Sandbox')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('TR-SCN-01..04')).toBeVisible();

    // 2. Verify Immutability Shield (TR-SCN-02)
    await expect(page.getByText('AUTHORITATIVE TWIN LOCKED')).toBeVisible();
    await expect(page.getByText('Base SHA-256:')).toBeVisible();

    // 3. Verify Scorecard Baseline KPIs
    await expect(page.getByText('Technical Losses')).toBeVisible();
    await expect(page.getByText('Min Tail Voltage')).toBeVisible();
    await expect(page.getByText('Max Line Ampacity')).toBeVisible();
    await expect(page.getByText('Overloaded Assets')).toBeVisible();

    // 4. Verify Reproducibility Token & Solver Telemetry (TR-SCN-04)
    await expect(page.getByText('Reproducibility Token:')).toBeVisible();
    await expect(page.getByText(/pandapower AC Newton-Raphson/i)).toBeVisible();
  });

  test('executes EV Fast-Charging Corridor preset and evaluates side-by-side delta scorecard', async ({ page }) => {
    // 1. Click EV Fast Charging Preset
    const evPreset = page.getByRole('button', { name: /EV Fast-Charging Corridor/i }).first();
    await expect(evPreset).toBeVisible();
    await evPreset.click();

    // 2. Wait for simulation result
    await expect(page.locator('h3:has-text("Base Twin vs. Scenario Case:")')).toBeVisible({ timeout: 10000 });

    // 3. Verify Scorecard Deltas (Loss increase or voltage change)
    await expect(page.getByText('PHYSICS SIMULATION SCORECARD')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Critical Assets Impact & Variance Table')).toBeVisible({ timeout: 10000 });
  });

  test('executes custom demand growth mutation and validates cross-tab deep-linking to digital twin map', async ({ page }) => {
    // 1. Click Simulate button
    const simButton = page.getByRole('button', { name: /SIMULATE WHAT-IF SCENARIO/i });
    await expect(simButton).toBeVisible();
    await simButton.click();

    // 2. Wait for table of impacted elements to render
    await expect(page.getByText('Critical Assets Impact & Variance Table')).toBeVisible({ timeout: 10000 });

    // 3. Locate the first ClickableAsset in the table
    const firstAssetLink = page.locator('tbody tr td button[data-testid^="clickable-asset-"]').first();
    await expect(firstAssetLink).toBeVisible({ timeout: 10000 });

    const assetCode = await firstAssetLink.getAttribute('data-asset-code');
    expect(assetCode).toBeTruthy();

    // 4. Click the asset link to trigger deep navigation to map
    await firstAssetLink.click();

    // 5. Verify URL transitioned to #map?asset=...
    await expect(page).toHaveURL(new RegExp(`#map\\?asset=${encodeURIComponent(assetCode!)}`));

    // 6. Verify main map is visible and close-up auto-zoom (zoom >= 18)
    await expect(page.locator('#network-leaflet-map')).toBeVisible();

    await page.waitForFunction(() => {
      const map = (window as any).__leafletMap;
      return map && typeof map.getZoom === 'function' && map.getZoom() >= 18;
    }, { timeout: 15000 });

    const finalZoom = await page.evaluate(() => (window as any).__leafletMap?.getZoom());
    expect(finalZoom).toBeGreaterThanOrEqual(18);
  });
});
