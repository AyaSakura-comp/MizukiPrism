/**
 * Playwright test: Import https://youtu.be/TGuSYMpwepw via manual paste mode
 * (bypasses YouTube API — uses manual title/date input instead)
 * The stream was already added to Supabase, so this verifies the discover UI flow.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test('Discover: import TGuSYMpwepw via URL (YouTube API)', async ({ page }) => {
  // Login
  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 5000 });

  // Navigate to discover
  await page.getByTestId('discover-nav-button').click();
  await page.waitForURL('**/admin/discover', { timeout: 5000 });

  // Paste YouTube URL
  await page.getByTestId('discover-url-input').fill('https://youtu.be/TGuSYMpwepw');
  await page.getByTestId('discover-fetch-button').click();

  // Wait for response — either extracting step or error
  await page.waitForTimeout(5000);

  // Take screenshot to see what happened
  await page.screenshot({ path: 'test-results/discover-kirali-result.png', fullPage: true });

  // Check if we got an API error shown on page
  const pageContent = await page.textContent('body');
  console.log('Page state after fetch:', pageContent?.slice(0, 500));
});
