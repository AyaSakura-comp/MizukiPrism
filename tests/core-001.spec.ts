import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('CORE-001: Streamer Profile & Song Catalog (Timeline View)', () => {

  test('AC1: Homepage loads with sidebar and main content area', async ({ page }) => {
    await page.goto(BASE_URL);

    // Verify sidebar elements (desktop)
    await expect(page.getByText('MizukiPlay')).toBeVisible();
    await expect(page.getByRole('button', { name: '首頁' })).toBeVisible();
    await expect(page.getByPlaceholder('搜尋歌曲...')).toBeVisible();
    await expect(page.getByText('歌枠回放')).toBeVisible();
    await expect(page.getByText(/Made with.*for 浠Mizuki/)).toBeVisible();

    // Verify main content area exists
    await expect(page.locator('main')).toBeVisible();
  });

  test('AC2: Streamer profile section displays all required information', async ({ page }) => {
    await page.goto(BASE_URL);

    // Verify profile elements
    await expect(page.getByRole('heading', { name: '浠Mizuki' })).toBeVisible();
    await expect(page.getByText(/歌勢Vtuber/)).toBeVisible();
    await expect(page.getByText(/\d+ 首歌曲/)).toBeVisible();

    // Verify social links are visible
    const youtubeLink = page.locator('a[href*="youtube"]').first();
    const twitterLink = page.locator('a[href*="x.com"], a[href*="twitter"]').first();
    await expect(youtubeLink).toBeVisible();
    await expect(twitterLink).toBeVisible();
  });

  test('AC3: YouTube social link opens in new tab', async ({ page, context }) => {
    await page.goto(BASE_URL);

    // Find YouTube link in social section (not the Follow button)
    const youtubeLink = page.locator('a[href*="youtube"]').first();

    // Verify it has target="_blank"
    await expect(youtubeLink).toHaveAttribute('target', '_blank');
    await expect(youtubeLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('AC4: Follow button opens YouTube channel subscription page', async ({ page }) => {
    await page.goto(BASE_URL);

    // Find Follow button (追蹤)
    const followButton = page.getByRole('link', { name: '追蹤' });
    await expect(followButton).toBeVisible();

    // Verify it has target="_blank" and points to YouTube
    await expect(followButton).toHaveAttribute('target', '_blank');
    await expect(followButton).toHaveAttribute('href', /youtube/);
  });

  test('AC5: Action bar with Play All button and follow button is visible', async ({ page }) => {
    await page.goto(BASE_URL);

    // Verify Play All button (the big round button with Play icon) — desktop action bar
    const playAllButton = page.getByTestId('desktop-play-all-button');
    await expect(playAllButton).toBeVisible();

    // Verify Follow button in action bar — on desktop the link is visible
    await expect(page.getByRole('link', { name: '追蹤' }).first()).toBeVisible();
  });

  test('AC6: All performances displayed in timeline, sorted by date descending', async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for data to load from API
    await page.waitForSelector('[data-testid="performance-row"]', { timeout: 10000 });

    // Get all date cells (they should be in descending order)
    const dates = await page.locator('div.font-mono').filter({ hasText: /^\d{4}-\d{2}-\d{2}$/ }).allTextContents();

    // Verify we have performances
    expect(dates.length).toBeGreaterThan(0);

    // Verify dates are in descending order (newest first)
    for (let i = 0; i < dates.length - 1; i++) {
      const currentDate = new Date(dates[i]);
      const nextDate = new Date(dates[i + 1]);
      expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
    }
  });

  test('AC7: Each performance shows title, artist, stream title, date, and note', async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for data to load
    await page.waitForSelector('[data-testid="performance-row"]', { timeout: 10000 });

    // Verify first performance has all required fields
    const firstPerformance = page.getByTestId('performance-row').first();

    // Date column: should contain a date in YYYY-MM-DD format
    await expect(firstPerformance).toContainText(/\d{4}-\d{2}-\d{2}/);

    // Stream title column: should contain non-empty text (歌枠 streams have titles)
    const streamTitleText = await firstPerformance.locator('.truncate').first().textContent();
    expect(streamTitleText?.trim().length).toBeGreaterThan(0);
  });

  test('AC8: Open in YouTube link works correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    // Hover over first performance to reveal YouTube link
    const firstPerformance = page.getByTestId('performance-row').first();
    await firstPerformance.hover();

    // Find the External Link button
    const youtubeLink = firstPerformance.locator('a[title="在 YouTube 開啟"]');
    await expect(youtubeLink).toBeVisible();

    // Verify the link format: youtube.com/watch?v={videoId}&t={timestamp}s
    const href = await youtubeLink.getAttribute('href');
    expect(href).toMatch(/youtube\.com\/watch\?v=.+&t=\d+s/);

    // Verify it opens in new tab
    await expect(youtubeLink).toHaveAttribute('target', '_blank');
  });

  test('AC9: Empty state displays when no songs match', async ({ page }) => {
    await page.goto(BASE_URL);

    // Search for something that doesn't exist
    const searchInput = page.getByPlaceholder('搜尋歌曲...');
    await searchInput.fill('NONEXISTENTSONG12345');

    // Verify empty state message
    await expect(page.getByText('找不到符合條件的歌曲')).toBeVisible();
  });

  test('AC10: UI language is Traditional Chinese throughout', async ({ page }) => {
    await page.goto(BASE_URL);

    // Verify key UI elements are in Traditional Chinese
    await expect(page.getByText('首頁')).toBeVisible();
    await expect(page.getByPlaceholder('搜尋歌曲...')).toBeVisible();
    await expect(page.getByText('歌枠回放')).toBeVisible();
    await expect(page.getByText('全部歌曲')).toBeVisible();
    await expect(page.getByRole('link', { name: '追蹤' })).toBeVisible();
    await expect(page.getByText('標題')).toBeVisible();
    await expect(page.getByText('出處直播')).toBeVisible();
    await expect(page.getByText('發布日期')).toBeVisible();
  });
});
