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
  await page.waitForTimeout(2000); // let player run a bit

  // Confirm song 0 is active (pink highlight)
  await expect(song0).toHaveClass(/bg-pink-50/);

  // Capture end-timestamp value before pausing
  const endInput = page.getByTestId('end-timestamp-input-0');
  const valueBefore = await endInput.inputValue();

  // Screenshot before pause
  await page.screenshot({ path: 'test-results/pause-before.png', fullPage: false });

  // Press pause
  await page.getByTestId('preview-play-pause-btn').click();
  await page.waitForTimeout(300);

  // Screenshot after pause
  await page.screenshot({ path: 'test-results/pause-after.png', fullPage: false });

  // End-timestamp should now be set to a non-empty timestamp
  const valueAfter = await endInput.inputValue();
  expect(valueAfter).not.toBe('');
  expect(valueAfter).toMatch(/^\d+:\d{2}/);

  // And it should differ from whatever it was before (or be newly set if it was empty)
  console.log(`End timestamp before pause: "${valueBefore}" → after pause: "${valueAfter}"`);
});
