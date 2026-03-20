import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test('copy block syncs live when end-timestamp is edited', async ({ page }) => {
  test.setTimeout(120000);

  // Login
  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 5000 });

  // Navigate to discover
  await page.getByTestId('discover-nav-button').click();
  await page.waitForURL('**/admin/discover', { timeout: 5000 });

  // Extract from YouTube URL
  await page.getByTestId('discover-url-input').fill('https://youtu.be/TGuSYMpwepw');
  await page.getByTestId('discover-fetch-button').click();
  await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 60000 });

  const copyBlock = page.getByTestId('song-list-copy-block');
  const endInput = page.getByTestId('end-timestamp-input-0');

  // Scroll to and edit the end-timestamp of first song
  await endInput.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await endInput.click();
  // React controlled inputs require triggering the native setter + input event
  await page.evaluate(() => {
    const input = document.querySelector('[data-testid="end-timestamp-input-0"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, '9:59:59');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(500);

  // Now scroll to copy block to show the updated text
  await copyBlock.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  const updatedText = await copyBlock.locator('pre').textContent() ?? '';
  expect(updatedText).toContain('9:59:59');
});
