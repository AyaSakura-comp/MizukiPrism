/**
 * E2E: Channel browser — paste channel URL, see stream list, click import
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const TEST_CHANNEL_URL = 'https://www.youtube.com/channel/UCjv4bfP_67WLuPheS-Z8Ekg';

test('channel browser: fetch streams and navigate to discover', async ({ page }) => {
  test.setTimeout(60000);

  // Login
  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 10000 });

  // Navigate to channel browser
  await page.goto(`${BASE_URL}/admin/channel`);
  await page.getByTestId('channel-url-input').fill(TEST_CHANNEL_URL);
  await page.getByTestId('channel-search-button').click();

  // Wait for results (API call + pagination)
  await expect(page.getByTestId('channel-header')).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: 'test-results/channel-01-results.png' });

  // Verify stream list or empty state appears
  const streamList = page.getByTestId('channel-stream-list');
  const emptyState = page.getByTestId('channel-empty');
  const hasResults = await streamList.isVisible().catch(() => false);
  const hasEmpty = await emptyState.isVisible().catch(() => false);
  expect(hasResults || hasEmpty).toBe(true);

  if (hasResults) {
    // Click first import button
    const firstImportBtn = page.locator('[data-testid^="import-btn-"]').first();
    await firstImportBtn.click();

    // Should navigate to /admin/discover with URL param
    await page.waitForURL('**/admin/discover**', { timeout: 10000 });
    expect(page.url()).toContain('url=');
    await page.screenshot({ path: 'test-results/channel-02-discover.png' });
  }
});

test('channel browser: shows streamer cards and click to load', async ({ page }) => {
  test.setTimeout(60000);

  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 10000 });

  await page.goto(`${BASE_URL}/admin/channel`);

  // Streamer cards should appear (loaded from Supabase)
  const firstCard = page.locator('.grid button').first();
  await expect(firstCard).toBeVisible({ timeout: 10000 });

  // Click first streamer card — should auto-trigger fetch
  await firstCard.click();
  await expect(page.getByTestId('channel-header')).toBeVisible({ timeout: 30000 });
});

test('channel browser: shows error for invalid URL', async ({ page }) => {
  test.setTimeout(20000);

  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 10000 });

  await page.goto(`${BASE_URL}/admin/channel`);
  await page.getByTestId('channel-url-input').fill('https://youtube.com/watch?v=abc');
  await page.getByTestId('channel-search-button').click();

  await expect(page.getByTestId('channel-error')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('channel-error')).toContainText('請輸入有效的');
});
