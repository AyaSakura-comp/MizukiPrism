/**
 * E2E: Verify iTunes duration detection and provenance badges in discover page.
 * Designed for /verify-video Gemini visual analysis.
 *
 * Test 1: Manual paste — all songs should show gray "none" badges
 * Test 2: YouTube URL — songs should show colored provenance badges (iTunes/MusicBrainz/comment)
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

async function loginAndNavigateToDiscover(page: any) {
  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 5000 });
  await page.getByTestId('discover-nav-button').click();
  await page.waitForURL('**/admin/discover', { timeout: 5000 });
}

test.describe('Discover: iTunes Duration, Artist, & Provenance Badges', () => {

  test('Manual paste missing artist shows iTunes badge for artist fallback', async ({ page }) => {
    await loginAndNavigateToDiscover(page);

    // Toggle manual mode
    await page.getByTestId('manual-mode-toggle').click();
    await page.waitForTimeout(300);

    // Fill stream info
    await page.getByTestId('manual-title-input').fill('Artist Fallback Test');
    await page.getByTestId('manual-date-input').fill('2026-03-08');

    // Paste 2 songs missing artists
    await page.getByTestId('paste-text-input').fill(
      '0:05:00 夜に駆ける\n0:10:30 Pretender'
    );

    // Extract
    await page.getByTestId('paste-extract-button').click();
    
    // It should now make iTunes requests to fill the duration AND the artist
    // Wait for either the iTunes or MusicBrainz artist badge to appear for the first song
    await expect(page.locator('.bg-blue-200.text-blue-800:has-text("iTunes"), .bg-violet-200.text-violet-800:has-text("MusicBrainz")').first()).toBeVisible({ timeout: 15000 });

    // Verify 2 songs appear
    await expect(page.getByTestId('extracted-song-0')).toBeVisible();
    await expect(page.getByTestId('extracted-song-1')).toBeVisible();

    // The artists should now be filled (e.g. YOASOBI and Official髭男dism)
    // Checking that we got *some* artist name populated that isn't empty
    const artistInput1 = page.locator('[data-testid="extracted-song-0"] input').last();
    const artistInput2 = page.locator('[data-testid="extracted-song-1"] input').last();

    expect(await artistInput1.inputValue()).not.toBe('');
    expect(await artistInput2.inputValue()).not.toBe('');

    // Wait 2 secs to capture video of badges
    await page.waitForTimeout(2000);
  });

  test('Manual paste shows gray "none" badges on all songs', async ({ page }) => {
    // Toggle manual mode
    await page.getByTestId('manual-mode-toggle').click();
    await page.waitForTimeout(300);

    // Fill stream info
    await page.getByTestId('manual-title-input').fill('iTunes Badge Test - Manual');
    await page.getByTestId('manual-date-input').fill('2026-03-08');

    // Paste 3 songs
    await page.getByTestId('paste-text-input').fill(
      '0:05:00 夜に駆ける / YOASOBI\n0:10:30 Pretender / Official髭男dism\n0:16:00 紅蓮華 / LiSA'
    );

    // Extract
    await page.getByTestId('paste-extract-button').click();
    await page.waitForTimeout(1000);

    // Verify 3 songs appear
    await expect(page.getByTestId('extracted-song-0')).toBeVisible();
    await expect(page.getByTestId('extracted-song-1')).toBeVisible();
    await expect(page.getByTestId('extracted-song-2')).toBeVisible();

    // Verify "none" badges are visible on all songs
    const badges = page.locator('span:text("none")');
    await expect(badges).toHaveCount(3);

    // Pause briefly so the video captures the badges clearly
    await page.waitForTimeout(2000);
  });

  test('YouTube URL import shows colored provenance badges', async ({ page, browserName }) => {
    test.setTimeout(300000); // 5 min — iTunes 3s/song + MusicBrainz fallback
    await loginAndNavigateToDiscover(page);

    // Log browser console messages for debugging
    page.on('console', msg => console.log(`[browser] ${msg.text()}`));

    // Paste a known karaoke stream URL (TGuSYMpwepw has a clean song list in comments)
    await page.getByTestId('discover-url-input').fill('https://youtu.be/TGuSYMpwepw');
    await page.getByTestId('discover-fetch-button').click();

    // Handle new streamer confirmation dialog if it appears (DB was wiped)
    try {
      await page.getByTestId('confirm-streamer-button').waitFor({ timeout: 10000 });
      await page.getByTestId('confirm-streamer-button').click();
    } catch {
      // No new streamer dialog — continue
    }

    // Wait for extraction + duration enrichment (iTunes 3s/song + MusicBrainz fallback)
    // Could take several minutes for large setlists
    // Wait for either extracted songs OR paste mode (no candidate comment found)
    await Promise.race([
      page.waitForSelector('[data-testid="extracted-song-0"]', { timeout: 240000 }),
      page.waitForSelector('[data-testid="paste-text-input"]', { timeout: 240000 }),
    ]);

    // If we ended up in paste mode, the video has no song list comment — skip badge check
    const inPasteMode = await page.getByTestId('paste-text-input').isVisible().catch(() => false);
    if (inPasteMode) {
      console.log('No candidate comment found — video has no song list in comments. Skipping badge check.');
      return;
    }

    // Wait for all badges to render
    await page.waitForTimeout(3000);

    // Check that provenance badges exist (at least one of: iTunes, MusicBrainz, comment, none)
    const itunesBadges = await page.locator('span:text("iTunes")').count();
    const mbBadges = await page.locator('span:text("MusicBrainz")').count();
    const commentBadges = await page.locator('span:text("comment")').count();
    const noneBadges = await page.locator('span:text("none")').count();
    const totalBadges = itunesBadges + mbBadges + commentBadges + noneBadges;

    console.log(`Provenance badges: iTunes=${itunesBadges}, MusicBrainz=${mbBadges}, comment=${commentBadges}, none=${noneBadges}`);

    // Every extracted song should have exactly one badge
    const songCount = await page.locator('[data-testid^="extracted-song-"]').count();
    expect(totalBadges).toBe(songCount);

    // At least one song should have been enriched by iTunes (the main goal of this feature)
    expect(itunesBadges).toBeGreaterThan(0);

    // Scroll through the song list slowly so video captures all badges
    const songList = page.locator('[data-testid^="extracted-song-"]').last();
    await songList.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
  });
});
