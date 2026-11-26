import { test, expect } from '@playwright/test';

test.describe('Distribution Switching & Automated FLISR Workbench', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/#switching');
  });

  test('validates switching telemetry, optimization plans, and FLISR mode execution', async ({ page }) => {
    // 1. Feeder Telemetry Bar
    await expect(page.getByText('TARGET FEEDER').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Puthiya Kadavu').first()).toBeVisible();
    await expect(page.getByText('TOTAL SWITCHES').first()).toBeVisible();
    await expect(page.getByText(/13 Switches/i).first()).toBeVisible();
    await expect(page.getByText('NORMALLY-OPEN TIES').first()).toBeVisible();

    // 2. Mode 1: Optimal Sectionalizing Plans
    await expect(page.getByText(/Candidate Reconfiguration Plans/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('PLAN-01').first()).toBeVisible({ timeout: 45000 });
    await expect(page.getByText('RECOMMENDED').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Break-Before-Make Switching Sequence/i).first()).toBeVisible();
    await expect(page.getByText(/OPEN \(BREAK\)/i).first()).toBeVisible();
    await expect(page.getByText(/CLOSE \(MAKE\)/i).first()).toBeVisible();

    // 3. Mode 2: Automated FLISR Switching
    await page.getByRole('button', { name: /Automated FLISR/i }).click();
    await expect(page.getByText('Faulted Line:')).toBeVisible({ timeout: 15000 });
    // Trigger Automated FLISR
    await page.getByRole('button', { name: /SIMULATE FAULT & TRIGGER FLISR/i }).click();
    await expect(page.getByText(/ISOLATED FAULT ZONE/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Step 1: Boundary Fault Isolation/i).first()).toBeVisible();
  });
});
