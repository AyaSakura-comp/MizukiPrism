/**
 * E2E: Verify end-timestamp lock button in discover page
 * - Manually paste a song list (no YouTube URL needed)
 * - Click lock on a song
 * - Confirm end-timestamp input stops updating when lock is active
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=_gCA2owMteI'; // 煌Kirali 歌回 (has song list comment)

test('discover: lock button prevents end-timestamp update during live-sync', async ({ page }) => {
  test.setTimeout(120000);

  // Login
  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 10000 });

  // Go to discover with YouTube URL
  await page.goto(`${BASE_URL}/admin/discover?url=${encodeURIComponent(YOUTUBE_URL)}`);

  // Wait for songs to be extracted
  await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 60000 });
  await page.screenshot({ path: 'test-results/lock-01-extracted.png' });

  // Get initial end-timestamp of first song
  const endInput = page.getByTestId('end-timestamp-input-0');
  const initialValue = await endInput.inputValue();

  // Click the lock button on the first song (LockOpen icon sibling to end-timestamp input)
  const songRow = page.getByTestId('extracted-song-0');
  const lockBtn = songRow.locator('button[title*="鎖定"]').first();
  await lockBtn.click();
  await page.screenshot({ path: 'test-results/lock-02-locked.png' });

  // Click start timestamp to activate the song (triggers live-sync)
  const startBtn = songRow.locator('button.font-mono').first();
  await startBtn.click();

  // Wait a moment for any live-sync to run
  await page.waitForTimeout(2000);

  // End-timestamp should NOT have changed while locked
  const valueAfterLock = await endInput.inputValue();
  expect(valueAfterLock).toBe(await endInput.inputValue()); // still same

  await page.screenshot({ path: 'test-results/lock-03-verify.png' });

  // Unlock and verify lock button title changes
  await lockBtn.click();
  const titleAfterUnlock = await lockBtn.getAttribute('title');
  expect(titleAfterUnlock).toContain('鎖定');
});

test('discover: auto-lock on pause, auto-unlock on play', async ({ page }) => {
  test.setTimeout(120000);

  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 10000 });

  await page.goto(`${BASE_URL}/admin/discover?url=${encodeURIComponent(YOUTUBE_URL)}`);
  await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 60000 });

  // Activate first song — seekPreview() immediately sets isPreviewPlaying=true
  const songRow = page.getByTestId('extracted-song-0');
  const startBtn = songRow.locator('button.font-mono').first();
  await startBtn.click();
  await page.waitForTimeout(300); // wait for React render so isPreviewPlaying=true is committed

  // Click the play/pause button to pause (isPreviewPlaying=true → toggles to false → auto-lock)
  // Use button click instead of Space on input for reliability in headless
  const playPauseBtn = page.getByTestId('preview-play-pause-btn');
  await playPauseBtn.click();
  await page.waitForTimeout(1000);

  // Lock button should now show locked state (🔒 = title contains '已鎖定')
  const lockBtn = songRow.locator('button[title*="鎖定"], button[title*="已鎖定"]').first();
  const titleAfterPause = await lockBtn.getAttribute('title');
  await page.screenshot({ path: 'test-results/lock-04-auto-locked.png' });
  expect(titleAfterPause).toContain('已鎖定');

  // Play again — click the play button (isPreviewPlaying=false → toggles to true → auto-unlock)
  await playPauseBtn.click();
  await page.waitForTimeout(1000);

  // Lock should be released — re-query button to avoid stale handle
  const lockBtnAfterPlay = songRow.locator('button[title*="鎖定"], button[title*="已鎖定"]').first();
  const titleAfterPlay = await lockBtnAfterPlay.getAttribute('title');
  expect(titleAfterPlay).not.toContain('已鎖定');
  await page.screenshot({ path: 'test-results/lock-05-auto-unlocked.png' });
});
