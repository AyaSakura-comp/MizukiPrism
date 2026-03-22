/**
 * E2E: Verify admin link buttons on homepage navigate to /admin
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('homepage admin link', () => {
  test('desktop sidebar admin link navigates to /admin', async ({ page }) => {
    test.setTimeout(30000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const adminLink = page.getByTestId('admin-link');
    await expect(adminLink).toBeVisible({ timeout: 5000 });
    await Promise.all([
      page.waitForURL('**/admin**'),
      adminLink.click(),
    ]);
    expect(page.url()).toContain('/admin');
    await page.screenshot({ path: 'test-results/admin-link-desktop.png' });
  });

  test('mobile profile tab admin link navigates to /admin', async ({ page }) => {
    test.setTimeout(30000);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Switch to Profile tab
    const profileTab = page.locator('nav button').filter({ hasText: 'Profile' });
    await profileTab.click();
    await page.waitForTimeout(500);

    const mobileAdminLink = page.getByTestId('mobile-admin-link');
    await expect(mobileAdminLink).toBeVisible({ timeout: 5000 });
    await Promise.all([
      page.waitForURL('**/admin**'),
      mobileAdminLink.click(),
    ]);
    expect(page.url()).toContain('/admin');
    await page.screenshot({ path: 'test-results/admin-link-mobile.png' });
  });
});
