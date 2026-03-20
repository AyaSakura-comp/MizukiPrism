import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test('discover copy block appears in YouTube URL extraction flow', async ({ page }) => {
  test.setTimeout(120000);
  // Login
  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 5000 });

  // Navigate to discover
  await page.getByTestId('discover-nav-button').click();
  await page.waitForURL('**/admin/discover', { timeout: 5000 });

  // Paste YouTube URL
  await page.getByTestId('discover-url-input').fill('https://youtu.be/TGuSYMpwepw');
  await page.getByTestId('discover-fetch-button').click();

  // Wait for extraction to complete (songs appear)
  await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 60000 });

  // Verify copy block is present
  const copyBlock = page.getByTestId('song-list-copy-block');
  await expect(copyBlock).toBeVisible();

  // Verify formatted text has correct structure
  const text = await copyBlock.locator('pre').textContent() ?? '';
  expect(text).toMatch(/01\./);
  expect(text).toContain(' / ');

  // Scroll to copy block so it's visible in video
  await copyBlock.scrollIntoViewIfNeeded();

  // Click copy and verify feedback
  const copyBtn = page.getByTestId('copy-song-list-button');
  await copyBtn.click();
  await expect(copyBtn).toContainText('已複製！');
  await expect(copyBtn).toContainText('複製', { timeout: 4000 });
});
