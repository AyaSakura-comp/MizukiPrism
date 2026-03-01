import { test, expect } from '@playwright/test';

test.describe('Admin Stamp Workflow', () => {
  test('Verify timestamp marking UI and interactions', async ({ page }) => {
    // Listen for console logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // 1. Login
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    
    await Promise.all([
      page.waitForURL('**/admin', { timeout: 20000 }),
      page.getByTestId('login-button').click({ force: true })
    ]);

    // 2. Navigate to Stamp page
    await page.waitForSelector('[data-testid="stamp-nav-button"]', { timeout: 10000 });
    await page.getByTestId('stamp-nav-button').click();
    await page.waitForURL('**/admin/stamp', { timeout: 10000 });

    // 3. Verify page structure
    await expect(page.getByTestId('stamp-stream-list')).toBeVisible();
    
    // Check if streams are loaded
    const streams = page.getByTestId('stamp-stream-list').locator('button');
    await expect(streams).not.toHaveCount(0);
    
    console.log('Streams count:', await streams.count());

    // 4. Select a stream from the list
    const firstStream = streams.first();
    const streamTitle = await firstStream.locator('p').first().innerText();
    console.log('Clicking stream:', streamTitle);
    await firstStream.click();

    // 5. Verify song list updates
    await page.waitForTimeout(2000); // Wait for potential state update
    const songButtons = page.getByTestId('stamp-song-list').locator('button');
    const songCount = await songButtons.count();
    console.log('Songs count after click:', songCount);

    if (songCount === 0) {
      await page.screenshot({ path: 'videos/stamp-debug-empty-songs.png' });
      const rightPanelText = await page.getByTestId('stamp-song-list').innerText();
      console.log('Right panel text:', rightPanelText);
    }

    await expect(songButtons).not.toHaveCount(0);

    // 6. Select a song
    const firstSong = songButtons.first();
    await firstSong.click();

    // 7. Verify player and marking buttons appear
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('stamp-mark-end-button')).toBeVisible();

    // 8. Test keyboard shortcut (Space to play/pause)
    await page.keyboard.press(' ');
    await page.waitForTimeout(1000);
    
    // 9. Record interaction
    await page.waitForTimeout(2000);
  });
});
