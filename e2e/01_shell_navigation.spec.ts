import { test, expect } from '@playwright/test';

test.describe('GridSense-AI Platform Shell & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#overview');
  });

  test('loads application shell with correct branding, advisory banner, and system status', async ({ page }) => {
    // 1. Verify Platform Title and Version
    await expect(page.getByText('GridSense-AI', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('v0.1').first()).toBeVisible();

    // 2. Verify Non-negotiable Advisory-Only Badge
    await expect(page.getByText('ADVISORY ONLY').first()).toBeVisible();

    // 3. Verify System Telemetry Indicators
    await expect(page.getByText(/DB:\s*\d+\s*tbls/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('pandapower NR').first()).toBeVisible();
  });

  test('navigates seamlessly across all top-level tabs and updates URL hash', async ({ page }) => {
    // 1. Executive Overview tab
    await page.getByRole('button', { name: 'Executive Overview' }).click();
    await expect(page).toHaveURL(/#overview/);
    await expect(page.getByText(/Distribution Command Centre & Regulatory Compliance/i)).toBeVisible();

    // 2. Network Digital Twin tab
    await page.getByRole('button', { name: 'Network Digital Twin' }).click();
    await expect(page).toHaveURL(/#map/);
    await expect(page.locator('#network-leaflet-map')).toBeVisible();

    // 3. Switching & FLISR tab
    await page.getByRole('button', { name: 'Switching & FLISR' }).click();
    await expect(page).toHaveURL(/#switching/);
    await expect(page.getByText('Switching & FLISR Workbench').first()).toBeVisible({ timeout: 15000 });

    // 4. CAPEX Intelligence tab
    await page.getByRole('button', { name: 'CAPEX Intelligence' }).click();
    await expect(page).toHaveURL(/#capex/);
    await expect(page.getByText(/CAPEX Intelligence & Asset Investment Planner/i).first()).toBeVisible({ timeout: 15000 });

    // 5. Scenario Simulator tab
    await page.getByRole('button', { name: 'Scenario Simulator' }).click();
    await expect(page).toHaveURL(/#scenarios/);
    await expect(page.getByText(/Scenario Simulator/i).first()).toBeVisible();
  });
});
