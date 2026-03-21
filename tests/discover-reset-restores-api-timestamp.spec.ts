/**
 * E2E test: Reset button restores iTunes/MusicBrainz detected end-timestamp,
 * not the current player time (even after live-sync has overwritten it).
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const TEST_VIDEO_URL = 'https://youtu.be/TGuSYMpwepw';

test('reset button restores API-detected end-timestamp after live-sync overwrites it', async ({ page }) => {
  test.setTimeout(240000);

  // Login
  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 10000 });

  // Fetch video and wait for extraction + iTunes enrichment
  await page.goto(`${BASE_URL}/admin/discover`);
  await page.getByTestId('discover-url-input').fill(TEST_VIDEO_URL);
  await page.getByTestId('discover-fetch-button').click();
  await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 120000 });
  await page.waitForTimeout(4000); // let YT player initialize

  // Capture the iTunes/API-detected end-timestamp for song 0 (before any live-sync)
  const endInput = page.getByTestId('end-timestamp-input-0');
  const apiDetectedTimestamp = await endInput.inputValue();
  console.log(`API-detected end timestamp: "${apiDetectedTimestamp}"`);
  expect(apiDetectedTimestamp).toMatch(/^\d+:\d{2}/); // must be non-empty timestamp

  // Click song 0's play button → activates live-sync, player starts
  const song0 = page.getByTestId('extracted-song-0');
  await song0.locator('button').first().click();
  await page.waitForTimeout(2000);

  // Confirm live-sync is running (end-timestamp changes)
  await page.waitForTimeout(6000);
  const liveSyncedTimestamp = await endInput.inputValue();
  console.log(`Live-synced end timestamp: "${liveSyncedTimestamp}"`);
  expect(liveSyncedTimestamp).not.toBe(apiDetectedTimestamp); // must differ from original

  await page.screenshot({ path: 'test-results/reset-api-01-after-livesync.png' });

  // Click reset (還原此曲目) — should restore API timestamp, not current player time
  await song0.getByTitle('還原此曲目').click();
  await page.waitForTimeout(800); // wait for React re-render + interval to NOT fire

  const restoredTimestamp = await endInput.inputValue();
  console.log(`Restored end timestamp: "${restoredTimestamp}"`);

  await page.screenshot({ path: 'test-results/reset-api-02-after-reset.png' });

  // Must match the API-detected value, not the live-synced player position
  expect(restoredTimestamp).toBe(apiDetectedTimestamp);
  // And must NOT be the live-synced (current player) value
  expect(restoredTimestamp).not.toBe(liveSyncedTimestamp);
});
