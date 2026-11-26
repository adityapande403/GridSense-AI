import { test, expect } from '@playwright/test';

test.describe('Network Digital Twin & Asset Inspection Drawer Harmonization', () => {
  test('verifies active feeder bar telemetry and Beach 2 cross-tab mathematical consistency', async ({ page }) => {
    test.setTimeout(60000);
    // Navigate directly to map with Beach 2 auto-selected
    await page.goto('/#map?dtr=DT-2011951-001');

    // 1. Verify Top Telemetry Strip
    await expect(page.getByText('ACTIVE FEEDER:')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Puthiya Kadavu/i).first()).toBeVisible();
    await expect(page.getByText(/1 Overloaded/i)).toBeVisible();

    // 2. Verify Asset Inspection Drawer opens for Beach 2
    await expect(page.getByText('Beach 2').first()).toBeVisible({ timeout: 20000 });

    // Header AHI badge must reflect thermal stress (81 / 100)
    await expect(page.locator('span', { hasText: 'AHI: 81' }).first()).toBeVisible({ timeout: 15000 });

    // 3. TAB 1: Specs Tab Verification
    await page.getByRole('button', { name: 'Specs' }).click();
    await expect(page.getByText('CURRENT UTILIZATION').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('108.5%').first()).toBeVisible();
    await expect(page.getByText('Status: OVERLOADED').first()).toBeVisible();
    await expect(page.getByText('250 kVA').first()).toBeVisible();

    // 4. TAB 2: 24h Load Profile Tab Verification
    await page.getByRole('button', { name: '24h Load' }).click();
    await expect(page.getByText(/Diurnal Load Profile/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Peak Demand')).toBeVisible();
    await expect(page.getByText(/244\.\d+\s*kW/i).first()).toBeVisible();

    // 5. TAB 3: IEC 60076-7 Thermal Dynamics Tab Verification
    await page.getByRole('button', { name: 'IEC Thermal' }).click();
    await expect(page.getByText(/Asset Health Index \(AHI\)/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/81\.0\s*\/\s*100/i)).toBeVisible();
    await expect(page.getByText('Status: WARNING (THERMAL STRESS)')).toBeVisible();
    await expect(page.getByText(/Hours overload:\s*3\s*hrs/i)).toBeVisible();
    await expect(page.getByText(/108\.6°C/i)).toBeVisible();
    await expect(page.getByText(/33\.5°C/i)).toBeVisible();

    // 6. TAB 4: ML Forecast Tab Verification
    await page.getByRole('button', { name: 'ML Forecast' }).click();
    await expect(page.getByText('Current Active').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('244.1 kW').first()).toBeVisible();
    await expect(page.getByText('108.5% Load').first()).toBeVisible();

    // Verify Quantile Cone SVG and Walk-Forward Benchmark Scorecard
    await expect(page.getByText(/Chronological Walk-Forward Benchmarks/i)).toBeVisible();
    await expect(page.getByText('+1h').first()).toBeVisible();
    await expect(page.getByText('+4h').first()).toBeVisible();
    await expect(page.getByText('+8h').first()).toBeVisible();
    await expect(page.getByText('+24h').first()).toBeVisible();
    await expect(page.getByText('Accuracy Gain')).toBeVisible();
  });
});
