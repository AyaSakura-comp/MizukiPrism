import { test, expect } from '@playwright/test';

test.describe('Admin Panel Full Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    await Promise.all([
      page.waitForURL('**/admin', { timeout: 20000 }),
      page.getByTestId('login-button').click({ force: true })
    ]);
  });

  test('Verify Metadata Page renders', async ({ page }) => {
    await page.getByTestId('metadata-nav-button').click();
    await page.waitForURL('**/admin/metadata');
    await expect(page.getByText('中繼資料管理')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    await page.waitForTimeout(2000);
  });

  test('Verify Deploy Page renders', async ({ page }) => {
    await page.getByTestId('deploy-nav-button').click();
    await page.waitForURL('**/admin/deploy');
    await expect(page.getByText('發布更改')).toBeVisible();
    // Expect either "Everything is ready" or the "Commit form"
    await expect(page.locator('body')).toContainText(/一切就緒|提交更改/);
    await page.waitForTimeout(2000);
  });

  test('Verify Stamp Page renders and loads data', async ({ page }) => {
    await page.getByTestId('stamp-nav-button').click();
    await page.waitForURL('**/admin/stamp');
    await expect(page.getByTestId('stamp-stream-list')).toBeVisible();
    
    // Wait for data to load
    await page.waitForTimeout(3000);
    const streams = page.getByTestId('stamp-stream-list').locator('button');
    if (await streams.count() > 0) {
      await streams.first().click();
      await page.waitForTimeout(2000);
      await expect(page.getByTestId('stamp-player')).toBeVisible();
    }
    await page.waitForTimeout(2000);
  });
});
