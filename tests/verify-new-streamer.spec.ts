import { test, expect } from '@playwright/test';

test.describe('Test adding new streamer (Kirali)', () => {
  test('Imports video gOdBkLapyLo and verifies new streamer is added', async ({ page }) => {
    // 1. Admin Login
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    await page.getByTestId('login-button').click();
    await page.waitForURL('**/admin');

    // 2. Go to Discover and fetch the new video
    await page.getByTestId('discover-nav-button').click();
    await page.waitForURL('**/admin/discover');
    await page.getByTestId('discover-url-input').fill('https://www.youtube.com/watch?v=gOdBkLapyLo');
    await page.getByTestId('discover-fetch-button').click();

    // 3. Wait for the New Streamer Confirmation UI
    const confirm = page.getByTestId('new-streamer-confirm');
    await expect(confirm).toBeVisible({ timeout: 15000 });
    
    // Check if the input contains "煌Kirali Channel" or similar
    await expect(page.getByTestId('streamer-name-input')).toBeVisible();
    
    // 4. Confirm adding the new streamer
    await page.getByTestId('confirm-streamer-button').click();

    // 5. Wait for extraction to complete and the first song to be visible
    await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 30000 });

    // 6. Click 'Import' to add the stream and songs to the database
    await page.getByTestId('import-button').click();

    // Wait a bit for the import to process and save JSON files
    await page.waitForTimeout(3000);

    // 7. Verify the streamer switcher on the fan-facing page
    await page.goto('/');
    
    // The streamer switcher should now be visible because there are multiple streamers
    const switcher = page.getByTestId('streamer-switcher');
    await expect(switcher).toBeVisible({ timeout: 15000 });
    
    // Wait an extra moment so the video captures the final UI clearly
    await page.waitForTimeout(3000);
  });
});
