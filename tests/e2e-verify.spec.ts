/**
 * E2E Verification Tests — designed for /verify-video Gemini visual analysis.
 * Each test covers a distinct user journey and produces a labeled video.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('E2E-VER-1: Fan Page — Song Catalog & Playback', () => {
  test('Fan page loads songs, search filters, play button launches mini player', async ({ page }) => {
    // 1. Load fan page
    await page.goto(BASE_URL);

    // 2. Wait for songs to load from Supabase
    await page.waitForSelector('[data-testid="performance-row"]', { timeout: 15000 });

    // 3. Verify song list has items with date and stream title
    const rows = page.getByTestId('performance-row');
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toContainText(/\d{4}-\d{2}-\d{2}/);

    // 4. Search for a song
    const searchInput = page.getByPlaceholder('搜尋歌曲...');
    await searchInput.fill('青花瓷');
    await page.waitForTimeout(500);

    // 5. Verify filtered results
    await expect(page.getByTestId('performance-row').first()).toContainText('青花瓷');

    // 6. Clear search
    await searchInput.clear();
    await page.waitForTimeout(300);

    // 7. Click play on the first song
    const firstRow = page.getByTestId('performance-row').first();
    await firstRow.hover();
    const playBtn = firstRow.locator('button').first();
    await playBtn.click();

    // 8. Wait for mini player to appear
    await page.waitForTimeout(2000);

    // 9. Verify mini player is visible (bottom of screen)
    const miniPlayer = page.locator('[data-testid="mini-player"], .mini-player, [class*="mini"]').first();
    // Even if testid varies, check for YouTube iframe or player controls
    const hasPlayer = await page.locator('iframe[src*="youtube"]').count() > 0
      || await page.locator('[data-testid="mini-player"]').count() > 0;
    expect(hasPlayer).toBeTruthy();
  });
});

test.describe('E2E-VER-2: Admin Login & Song Management', () => {
  test('Admin login with password, view streams and songs tabs', async ({ page }) => {
    // 1. Navigate to admin login
    await page.goto(`${BASE_URL}/admin/login`);
    await expect(page.locator('h1, h2').filter({ hasText: /MizukiPrism|登入/ }).first()).toBeVisible();

    // 2. Submit wrong password — should show error
    const passwordInput = page.getByTestId('password-input');
    await passwordInput.fill('wrong-password');
    await page.getByTestId('login-button').click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="login-error"], .text-red')).toBeVisible();

    // 3. Login with correct password
    await passwordInput.clear();
    await passwordInput.fill('mizuki-admin');
    await page.getByTestId('login-button').click();

    // 4. Should redirect to /admin
    await page.waitForURL('**/admin', { timeout: 5000 });
    await expect(page.getByTestId('admin-tabs')).toBeVisible();

    // 5. Check streams tab is visible and has streams
    await page.getByTestId('streams-tab').click();
    await page.waitForTimeout(1000);
    const streamItems = page.locator('[data-testid^="stream-item-"]');
    expect(await streamItems.count()).toBeGreaterThan(0);

    // 6. Switch to songs tab
    await page.getByTestId('songs-tab').click();
    await page.waitForTimeout(1000);
    const songItems = page.locator('[data-testid^="song-item-"]');
    expect(await songItems.count()).toBeGreaterThan(0);

    // 7. Logout
    await page.getByTestId('logout-button').click();
    await page.waitForURL('**/admin/login', { timeout: 5000 });
  });
});

test.describe('E2E-VER-3: Admin Discover — Paste Import Flow', () => {
  test('Admin can manually paste a song list and import it', async ({ page }) => {
    // 1. Login
    await page.goto(`${BASE_URL}/admin/login`);
    await page.getByTestId('password-input').fill('mizuki-admin');
    await page.getByTestId('login-button').click();
    await page.waitForURL('**/admin', { timeout: 5000 });

    // 2. Navigate to discover
    await page.getByTestId('discover-nav-button').click();
    await page.waitForURL('**/admin/discover', { timeout: 5000 });

    // 3. Toggle manual mode
    await page.getByTestId('manual-mode-toggle').click();
    await page.waitForTimeout(300);

    // 4. Fill in stream title and date
    await page.getByTestId('manual-title-input').fill('測試歌回 E2E Verify');
    await page.getByTestId('manual-date-input').fill('2026-01-01');

    // 5. Paste a song list
    await page.getByTestId('paste-text-input').fill(
      '0:05:00 夜に駆ける / YOASOBI\n0:10:30 Pretender / Official髭男dism\n0:16:00 紅蓮華 / LiSA'
    );

    // 6. Extract songs
    await page.getByTestId('paste-extract-button').click();
    await page.waitForTimeout(1000);

    // 7. Should show review step with 3 extracted songs
    await expect(page.getByTestId('extracted-song-0')).toBeVisible();
    await expect(page.getByTestId('extracted-song-1')).toBeVisible();
    await expect(page.getByTestId('extracted-song-2')).toBeVisible();

    // 8. Verify song names are correct (values are in input fields)
    const song0Input = page.getByTestId('extracted-song-0').locator('input').nth(1);
    const song1Input = page.getByTestId('extracted-song-1').locator('input').nth(1);
    const song2Input = page.getByTestId('extracted-song-2').locator('input').nth(1);
    await expect(song0Input).toHaveValue('夜に駆ける');
    await expect(song1Input).toHaveValue('Pretender');
    await expect(song2Input).toHaveValue('紅蓮華');

    // 9. Import to Supabase
    await page.getByTestId('import-button').click();
    // 10. Verify success screen (allow up to 15s for Supabase writes)
    await expect(page.locator('text=匯入完成')).toBeVisible({ timeout: 15000 });
  });
});
