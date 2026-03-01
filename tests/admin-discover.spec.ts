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

    // Enable manual mode and fill song list text
    await page.getByTestId('manual-mode-toggle').click();
    await page.getByTestId('manual-title-input').fill('Test Stream');
    await page.getByTestId('paste-text-input').fill(
      '0:04:23 誰 / 李友廷\n0:08:26 Shape of You / Ed Sheeran\n0:12:00 夜曲 / 周杰倫'
    );
    await page.getByTestId('paste-extract-button').click();

    // Verify extracted songs appear
    await expect(page.getByTestId('extracted-song-0')).toBeVisible();
    await expect(page.getByTestId('extracted-song-1')).toBeVisible();
    await expect(page.getByTestId('extracted-song-2')).toBeVisible();

    // Edit a song name inline (video captures the interaction)
    const songInput = page.getByTestId('extracted-song-1').locator('input').first();
    await songInput.clear();
    await songInput.fill('Shape of You (Acoustic)');

    // Remove last song
    await page.getByTestId('extracted-song-2').locator('button').click();
    await expect(page.getByTestId('extracted-song-2')).not.toBeVisible();

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
