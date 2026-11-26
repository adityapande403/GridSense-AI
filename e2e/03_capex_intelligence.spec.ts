import { test, expect } from '@playwright/test';

test.describe('CAPEX Intelligence & Investment Optimization', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/#capex');
  });

  test('loads CAPEX workbench with active feeder context and evaluates subtabs', async ({ page }) => {
    // 1. Feeder Context Bar
    await expect(page.getByText('TARGET FEEDER').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Puthiya Kadavu').first()).toBeVisible();
    await expect(page.getByText('LOSS VALUATION (ACoS)')).toBeVisible({ timeout: 15000 });

    // 2. SUBTAB 1: Reconductoring Portfolio
    await page.getByRole('button', { name: /Reconductoring Ranker/i }).click();
    await expect(page.getByText('PORTFOLIO RECONDUCTORING CAPEX')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/ACSR_Dog/i).first()).toBeVisible();

    // 3. SUBTAB 2: 3-Way DTR Decision Matrix
    await page.getByRole('button', { name: /3-Way DTR Decisions/i }).click();
    await expect(page.getByText('Select Transformer:')).toBeVisible({ timeout: 15000 });
    // Click Beach 2 pill
    await page.getByRole('button', { name: /Beach 2/i }).first().click();
    await expect(page.getByText('108.5%').first()).toBeVisible();
    await expect(page.getByText(/81\.0\s*\/\s*100/i).first()).toBeVisible();
    await expect(page.getByText(/RECOMMENDED OPTION/i).first()).toBeVisible();

    // 4. SUBTAB 3: Feeder Bifurcation Planner
    await page.getByRole('button', { name: /Feeder Bifurcation/i }).click();
    await expect(page.getByText('LOAD-MOMENT CENTROID', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Candidate Graph-Cut Splits/i)).toBeVisible();
    await expect(page.getByText('SPLIT-01').first()).toBeVisible();
    await expect(page.getByText('OPTIMAL CUT').first()).toBeVisible();

    // 5. SUBTAB 4: Tornado Sensitivity Analysis
    await page.getByRole('button', { name: /Tornado Sensitivity/i }).click();
    await expect(page.getByText('BASE PORTFOLIO CAPEX')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Bulk Loss Valuation (ACoS)').first()).toBeVisible();
    await expect(page.getByText('Cost of Capital / Discount Rate').first()).toBeVisible();
  });
});
