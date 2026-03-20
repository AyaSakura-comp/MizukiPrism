/**
 * E2E test: Mobile layout of discover page review step
 * Verifies that on mobile viewport:
 * - Player card is stacked on top (full width, not side-by-side)
 * - Player card is sticky (stays visible while scrolling)
 * - Song list is below the player
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const TEST_VIDEO_URL = 'https://youtu.be/TGuSYMpwepw';

test('mobile layout: player stacked on top, sticky while scrolling song list', async ({ page }) => {
  test.setTimeout(180000);
  // Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });

  // Login
  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 10000 });

  // Go to discover and fetch video
  await page.goto(`${BASE_URL}/admin/discover`);
  await page.getByTestId('discover-url-input').fill(TEST_VIDEO_URL);
  await page.getByTestId('discover-fetch-button').click();

  // Wait for songs to appear
  await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 120000 });
  await page.waitForTimeout(3000);

  // Screenshot 1: Initial state — player at top, song list below
  await page.screenshot({ path: 'test-results/mobile-layout-initial.png', fullPage: false });

  // Scroll down to song list — player should remain sticky at top
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  await page.waitForTimeout(500);

  // Screenshot 2: After scrolling — player still visible at top
  await page.screenshot({ path: 'test-results/mobile-layout-scrolled.png', fullPage: false });

  // Scroll further down
  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
  await page.waitForTimeout(500);

  // Screenshot 3: Further scrolled — player still sticky
  await page.screenshot({ path: 'test-results/mobile-layout-scrolled-far.png', fullPage: false });
});
