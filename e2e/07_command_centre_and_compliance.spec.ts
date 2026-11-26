import { test, expect } from '@playwright/test';

test.describe('Milestones 11 & 12: Command Centre & Regulatory Compliance', () => {
  test('validates live aggregated telemetry, mathematical audit modals, and operator audit trail', async ({
    page,
  }) => {
    // Navigate to root (Executive Overview)
    await page.goto('/#overview');
    await page.waitForLoadState('networkidle');

    // 1. Verify Command Centre Header and Multi-Feeder Scale
    await expect(
      page.getByText('Distribution Command Centre & Regulatory Compliance')
    ).toBeVisible({ timeout: 10000 });

    // Verify presence of aggregated telemetry cards
    await expect(page.getByText(/Network Topology Scale/i)).toBeVisible();
    await expect(page.getByText(/Distribution Fleet/i)).toBeVisible();
    await expect(page.getByText(/Technical Losses & Cost/i)).toBeVisible();
    await expect(page.getByText(/Statutory Tail Voltage/i)).toBeVisible();

    // 2. Test Calculation Audit Transparency Modal (TR-UI-04)
    // Click "View Loss Formulation"
    const viewLossBtn = page.getByRole('button', { name: /View Loss Formulation/i });
    await expect(viewLossBtn).toBeVisible();
    await viewLossBtn.click();

    // Modal should appear
    await expect(
      page.getByText(/Mathematical Audit & Standards Transparency/i)
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Governing Regulatory Standard/i)).toBeVisible();
    await expect(page.getByText(/pandapower AC Power Flow Convergence Proof/i)).toBeVisible();
    await expect(page.getByText(/Step-by-Step Mathematical Derivation/i)).toBeVisible();

    // Close modal
    const closeBtn = page.getByRole('button', { name: /Close Audit/i });
    await closeBtn.click();
    await expect(page.getByText(/Mathematical Audit & Standards Transparency/i)).not.toBeVisible();

    // 3. Test Transformer Thermal Aging Calculation Modal
    const viewThermalBtn = page.getByRole('button', { name: /View IEC 60076 Thermal Math/i });
    await expect(viewThermalBtn).toBeVisible();
    await viewThermalBtn.click();
    await expect(page.getByText(/IEC 60076-7 Thermal Hotspot/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Close Audit/i }).click();

    // 4. Test Multi-Feeder Control Matrix
    await expect(page.getByText(/Multi-Feeder Operational Fleet Matrix/i)).toBeVisible();
    // At least Beach Feeder 2011951 should be present in table
    const feederCell = page.locator('table').getByText('2011951').first();
    await expect(feederCell).toBeVisible();

    // 5. Verify Immutable Operator Audit Trail (TR-SEC-02)
    await expect(page.getByText(/Immutable Operator Audit Trail/i)).toBeVisible();
    await expect(page.getByText(/SHA-256 Ledger Verified/i)).toBeVisible();

    // 6. Test Operator Sign-Off Workflow
    const signoffBtn = page.getByRole('button', { name: /Operator Sign-Off/i });
    await expect(signoffBtn).toBeVisible();
    await signoffBtn.click();

    // Modal appears
    await expect(page.getByText(/Record Operator Engineering Sign-Off/i)).toBeVisible();
    await page.getByRole('button', { name: /Submit Sign-Off/i }).click();

    // Audit log should refresh and show recent entry
    await expect(page.getByText(/Record Operator Engineering Sign-Off/i)).not.toBeVisible();
    await expect(page.locator('table').getByText(/OPERATOR ENGINEERING SIGNOFF/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('validates regulatory engineering report export endpoint responsiveness', async ({ page }) => {
    // Direct verification of report generation endpoint
    const response = await page.request.get('/api/v1/compliance/export-report?feeder_code=2011951&format=json');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.compliance_status).toBe('VALIDATED_FEASIBLE');
    expect(body.report_hash.length).toBe(64);

    const htmlResponse = await page.request.get('/api/v1/compliance/export-report?feeder_code=2011951&format=html');
    expect(htmlResponse.status()).toBe(200);
    const htmlText = await htmlResponse.text();
    expect(htmlText).toContain('Distribution Engineering Audit & Statutory Compliance Report');
    expect(htmlText).toContain('A5 Validated Feasible');
    expect(htmlText).toContain('window.print()');
  });
});
