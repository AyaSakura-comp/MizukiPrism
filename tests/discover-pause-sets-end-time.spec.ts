/**
 * E2E test: Pressing pause writes current player time to the active song's end-timestamp input
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const TEST_VIDEO_URL = 'https://youtu.be/TGuSYMpwepw';

test('pause button writes current player time to active song end-timestamp', async ({ page }) => {
  test.setTimeout(180000);

  // Login
  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 10000 });

  // Fetch video
  await page.goto(`${BASE_URL}/admin/discover`);
  await page.getByTestId('discover-url-input').fill(TEST_VIDEO_URL);
  await page.getByTestId('discover-fetch-button').click();
  await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 120000 });
  await page.waitForTimeout(4000); // let YT player initialize

  // Click song 0's start timestamp → sets it as active and starts playing
  const song0 = page.getByTestId('extracted-song-0');
  await song0.locator('button').first().click();
  await page.waitForTimeout(2000); // let player initialize and start

  // Confirm song 0 is active (pink highlight)
  await expect(song0).toHaveClass(/bg-pink-50/);

  const endInput = page.getByTestId('end-timestamp-input-0');

  // Capture value at t=2s (should already be live-synced)
  const valueAt2s = await endInput.inputValue();
  await page.screenshot({ path: 'test-results/sync-at-2s.png', fullPage: false });
  console.log(`End timestamp at 2s: "${valueAt2s}"`);

  // Wait 6 more seconds — enough for the timestamp to visibly advance
  await page.waitForTimeout(6000);
  const valueAt8s = await endInput.inputValue();
  await page.screenshot({ path: 'test-results/sync-at-8s.png', fullPage: false });
  console.log(`End timestamp at 8s: "${valueAt8s}"`);

  // The value must have advanced (continuous sync working)
  expect(valueAt8s).not.toBe('');
  expect(valueAt8s).toMatch(/^\d+:\d{2}/);
  expect(valueAt8s).not.toBe(valueAt2s); // must have changed

  // Press pause
  await page.getByTestId('preview-play-pause-btn').click();
  await page.waitForTimeout(300);

  const valueAfterPause = await endInput.inputValue();
  await page.screenshot({ path: 'test-results/sync-after-pause.png', fullPage: false });
  console.log(`End timestamp after pause: "${valueAfterPause}"`);

  expect(valueAfterPause).toMatch(/^\d+:\d{2}/);
});
