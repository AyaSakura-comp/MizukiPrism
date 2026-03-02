import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SONGS_PATH = path.join(process.cwd(), 'data/songs.json');
const PROJECT_ROOT = process.cwd();

/** Restore data/ files to their last committed state via git checkout.
 *  More robust than fs.writeFileSync — survives OOM, crashes, and timeouts. */
function restoreDataFiles() {
  execSync('git checkout -- data/songs.json data/streams.json data/metadata/', {
    cwd: PROJECT_ROOT,
  });
}

test.describe.serial('Admin Discover & Import', () => {
  test.afterEach(() => {
    restoreDataFiles();
  });

  test('AC1: navigate to discover page from admin dashboard', async ({ page }) => {
    // Login
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    await page.getByTestId('login-button').click();
    await page.waitForURL('**/admin');

    // Navigate to discover
    await page.getByTestId('discover-nav-button').click();
    await expect(page).toHaveURL(/.*\/admin\/discover/);
    await expect(page.getByTestId('discover-url-input')).toBeVisible();

    // Brief pause so video captures the final state
    await page.waitForTimeout(1000);
  });

  test('AC2: paste text, extract songs, review inline', async ({ page }) => {
    // Login and navigate
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    await page.getByTestId('login-button').click();
    await page.waitForURL('**/admin');
    await page.goto('/admin/discover');

    // Use live YouTube fetch instead of manual paste
    await page.getByTestId('discover-url-input').fill('https://youtu.be/gOdBkLapyLo');
    await page.getByTestId('discover-fetch-button').click();

    // Wait for the extraction to finish and show the results
    await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 60000 });

    // Verify the first song (浪費 / 林宥嘉) has its end timestamp populated by iTunes (14:45 with 0 buffer)
    const endInput0 = page.getByTestId('end-timestamp-input-0'); 
    const val0 = await endInput0.inputValue();
    console.log("Song 0 End Timestamp:", val0);
    expect(val0).toBe('14:45');

    // Check the last song (11: "11 / 黃禮格"). Start: 1:57:19. End: 2:01:14
    await expect(page.getByTestId('extracted-song-11')).toBeVisible();
    const endInput11 = page.getByTestId('end-timestamp-input-11'); 
    const val11 = await endInput11.inputValue();
    console.log("Song 11 End Timestamp:", val11);
    expect(val11).toBe('2:01:14');

    // Edit the first song's name inline (video captures the interaction)
    const originalSongInput = page.getByTestId('extracted-song-0').locator('input').nth(1);
    await originalSongInput.clear();
    await originalSongInput.fill('浪費 (Acoustic)');

    // Remove the last song
    await page.getByTestId('extracted-song-11').locator('button').click();
    await expect(page.getByTestId('extracted-song-11')).not.toBeVisible();

    await page.waitForTimeout(1000);
  });

  test('AC3: import extracted songs into catalog', async ({ page }) => {
    // Login and navigate
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    await page.getByTestId('login-button').click();
    await page.waitForURL('**/admin');
    await page.goto('/admin/discover');

    // Enable manual mode and extract
    await page.getByTestId('manual-mode-toggle').click();
    await page.getByTestId('manual-title-input').fill('Test Stream');
    await page.getByTestId('paste-text-input').fill(
      '0:04:23 TestSong / TestArtist'
    );
    await page.getByTestId('paste-extract-button').click();
    await expect(page.getByTestId('extracted-song-0')).toBeVisible();

    // Click import
    await page.getByTestId('import-button').click();

    // Wait for success state
    await expect(page.getByText('匯入完成')).toBeVisible({ timeout: 10000 });

    // Verify data files were updated
    const songs = JSON.parse(fs.readFileSync(SONGS_PATH, 'utf-8'));
    const newSong = songs.find((s: { title: string; originalArtist: string }) => s.title === 'TestSong');
    expect(newSong).toBeTruthy();
    expect(newSong.originalArtist).toBe('TestArtist');

    await page.waitForTimeout(1000);
  });
});
