import { test, expect } from '@playwright/test';

test.describe('Universal Asset Code Search & Cross-Tab Deep Linking', () => {
  test('validates universal search bar on digital twin map with auto-suggest and fly-to selection', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Load map view
    await page.goto('/#map');
    await expect(page.getByText('ACTIVE FEEDER:')).toBeVisible({ timeout: 20000 });

    // 2. Locate Universal Search Bar
    const searchInput = page.getByTestId('asset-search-input');
    const searchBtn = page.getByTestId('asset-search-button');
    await expect(searchInput).toBeVisible();
    await expect(searchBtn).toBeVisible();

    // 3. Search for Transformer "Beach 2"
    await searchInput.fill('Beach 2');
    // Verify auto-suggest dropdown appears
    const suggestions = page.getByTestId('asset-search-suggestions');
    await expect(suggestions).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('search-suggestion-DT-2011951-001')).toBeVisible();

    // Click search button
    await searchBtn.click();

    // Asset inspection drawer should open for Beach 2
    await expect(page.getByText('Beach 2').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('DISTRIBUTION TRANSFORMER').first()).toBeVisible();

    // Verify main map is zoomed in on Beach 2 (>= 18), not zoomed out to whole feeder (<= 16)
    await page.waitForTimeout(600);
    const zoomBeach2 = await page.evaluate(() => (window as any).__leafletMap?.getZoom());
    expect(zoomBeach2).toBeGreaterThanOrEqual(18);

    // 4. Search for Line "HL-2011951-1"
    await searchInput.fill('HL-2011951-1');
    await searchBtn.click();

    // Drawer should switch to Line details
    await expect(page.getByText('HL-2011951-1').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/HT/i).first()).toBeVisible();

    // 5. Search for Switch "SW-DT-2011951-001"
    await searchInput.fill('SW-DT-2011951-001');
    await searchBtn.click();

    // Drawer should switch to Switch details
    await expect(page.getByText('SW-DT-2011951-001').first()).toBeVisible({ timeout: 15000 });
  });

  test('validates cross-tab clickable asset navigation from CAPEX Intelligence to Map', async ({ page }) => {
    test.setTimeout(60000);

    // Navigate to CAPEX Intelligence
    await page.goto('/#capex');
    await expect(page.getByText('TARGET FEEDER').first()).toBeVisible({ timeout: 20000 });

    // Switch to Reconductoring Ranker subtab
    await page.getByRole('button', { name: /Reconductoring Ranker/i }).click();
    await expect(page.getByText('PORTFOLIO RECONDUCTORING CAPEX')).toBeVisible({ timeout: 15000 });

    // Find first clickable line asset in reconductoring table
    const lineAssetBtn = page.locator('[data-testid^="clickable-asset-HL-"]').first();
    await expect(lineAssetBtn).toBeVisible({ timeout: 15000 });
    const lineCode = await lineAssetBtn.getAttribute('data-asset-code');
    expect(lineCode).toBeTruthy();

    // Click the line code link
    await lineAssetBtn.click();

    // Should transition to map tab
    await expect(page).toHaveURL(new RegExp(`#map\\?asset=${lineCode}`));
    await expect(page.getByText('ACTIVE FEEDER:')).toBeVisible({ timeout: 15000 });

    // Drawer should open displaying the target line
    await expect(page.getByText(lineCode!).first()).toBeVisible({ timeout: 15000 });

    // Verify main map is zoomed in on the selected line (>= 18)
    await page.waitForTimeout(600);
    const lineZoom = await page.evaluate(() => (window as any).__leafletMap?.getZoom());
    expect(lineZoom).toBeGreaterThanOrEqual(18);
  });

  test('validates cross-tab clickable asset navigation from Switching & FLISR Workbench to Map', async ({ page }) => {
    test.setTimeout(90000);

    // Navigate to Switching Workbench
    await page.goto('/#switching');
    await expect(page.getByText('TARGET FEEDER').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Candidate Reconfiguration Plans/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('PLAN-01').first()).toBeVisible({ timeout: 45000 });

    // Find clickable switch asset in optimization sequence
    const switchAssetBtn = page.locator('[data-testid^="clickable-asset-SW-"]').first();
    await expect(switchAssetBtn).toBeVisible({ timeout: 20000 });
    const switchCode = await switchAssetBtn.getAttribute('data-asset-code');
    expect(switchCode).toBeTruthy();

    // Click the switch code link
    await switchAssetBtn.click();

    // Should transition to map tab
    await expect(page).toHaveURL(new RegExp(`#map\\?asset=${switchCode}`));
    await expect(page.getByText('ACTIVE FEEDER:')).toBeVisible({ timeout: 15000 });

    // Drawer should open displaying the target switch
    await expect(page.getByText(switchCode!).first()).toBeVisible({ timeout: 15000 });

    // Verify main map is zoomed in on the selected switch (>= 18)
    await page.waitForTimeout(600);
    const switchZoom = await page.evaluate(() => (window as any).__leafletMap?.getZoom());
    expect(switchZoom).toBeGreaterThanOrEqual(18);
  });
});
