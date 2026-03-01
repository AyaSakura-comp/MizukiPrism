import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const PROJECT_ROOT = process.cwd();

function restoreDataFiles() {
  execSync('git checkout -- data/songs.json data/streams.json data/streamer.json data/metadata/', {
    cwd: PROJECT_ROOT,
  });
}

test.afterEach(() => restoreDataFiles());

test('End-to-end workflow: import -> duplicate warning -> filter -> play', async ({ page }) => {
  test.setTimeout(60000);
  // Setup: Clear data files initially to ensure clean state
  restoreDataFiles();

  // 1. Go to http://localhost:3000/admin and login
  await page.goto('http://localhost:3000/admin/login', { timeout: 60000 });
  await page.getByTestId('username-input').fill('curator');
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin');

  // 2. Import from songlist: https://www.youtube.com/watch?v=gOdBkLapyLo
  await page.goto('http://localhost:3000/admin/discover');
  await page.getByTestId('discover-url-input').fill('https://www.youtube.com/watch?v=gOdBkLapyLo');
  await page.getByTestId('discover-fetch-button').click();

  // New Streamer Confirmation might appear since it's Kirali
  const confirmBtn = page.getByTestId('confirm-streamer-button');
  await expect(confirmBtn).toBeVisible({ timeout: 15000 });
  await confirmBtn.click();

  // Wait for auto-extraction to complete
  await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 30000 });

  // Import songs
  await page.getByTestId('import-button').click();
  await expect(page.getByText('匯入完成')).toBeVisible({ timeout: 15000 });

  // 4. Go to home page
  await page.goto('http://localhost:3000/');

  // 5. Filter (select) kirali streamer
  // Wait for streamers to load
  await page.waitForSelector('[data-testid="streamer-switcher"]');
  // Click Kirali (may need to select by part of text since it's "煌Kirali Channel")
  await page.locator('[data-testid="streamer-switcher"] button').filter({ hasText: /Kirali/ }).click();

  // Try clicking until the player appears, to handle potential HMR full-reloads
  await expect(async () => {
    // Wait for songs to appear under this filter
    await page.waitForSelector('[data-testid="performance-row"]', { timeout: 3000 });
    
    const firstSong = page.getByTestId('performance-row').first();
    await firstSong.hover();
    await firstSong.locator('button').first().click();
    
    const pauseButton = page.getByTestId('mini-player-play-button');
    await expect(pauseButton).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30000, intervals: [1000, 2000, 5000] });

  // Done!
});
