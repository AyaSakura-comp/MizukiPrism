/**
 * E2E: Streamer lazy load — songs load per-streamer on demand
 *
 * Note: Tests 1-4 require multiple streamers in the DB.
 * Test 5 covers single-streamer auto-load.
 * If only 1 streamer exists, tests 1-4 will be skipped.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('streamer lazy load', () => {
  test('1: multi-streamer — no songs loaded on mount', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const streamerSwitcher = page.getByTestId('streamer-switcher');
    const hasMultiple = await streamerSwitcher.isVisible().catch(() => false);
    if (!hasMultiple) { test.skip(); return; }

    // Landing state should show prompt
    await expect(page.getByTestId('lazy-load-landing')).toBeVisible({ timeout: 5000 });
    // Song list should NOT be populated
    const songCount = await page.getByTestId('performance-row').count();
    expect(songCount).toBe(0);
    await page.screenshot({ path: 'test-results/lazy-load-01-landing.png' });
  });

  test('2: click streamer — songs load', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const streamerSwitcher = page.getByTestId('streamer-switcher');
    const hasMultiple = await streamerSwitcher.isVisible().catch(() => false);
    if (!hasMultiple) { test.skip(); return; }

    // Click first streamer button (not "All")
    const firstStreamer = streamerSwitcher.locator('button').nth(1);
    await firstStreamer.click();

    // Loading indicator may appear briefly
    await expect(page.getByTestId('songs-loading')).toBeVisible({ timeout: 5000 }).catch(() => {});

    // Wait for songs to render
    await expect(page.getByTestId('performance-row').first()).toBeVisible({ timeout: 15000 });
    const count = await page.getByTestId('performance-row').count();
    expect(count).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/lazy-load-02-songs-loaded.png' });
  });

  test('3: multi-select — accumulate songs', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const streamerSwitcher = page.getByTestId('streamer-switcher');
    const hasMultiple = await streamerSwitcher.isVisible().catch(() => false);
    if (!hasMultiple) { test.skip(); return; }

    const buttons = streamerSwitcher.locator('button');
    const btnCount = await buttons.count();
    if (btnCount < 3) { test.skip(); return; }

    // Click first streamer
    await buttons.nth(1).click();
    await expect(page.getByTestId('performance-row').first()).toBeVisible({ timeout: 15000 });
    const countAfterFirst = await page.getByTestId('performance-row').count();

    // Click second streamer (multi-select)
    await buttons.nth(2).click();
    // Wait for new songs to load
    await page.waitForTimeout(3000);
    const countAfterSecond = await page.getByTestId('performance-row').count();

    // Total should have increased (or at least stayed same if streamer B has no unique songs)
    expect(countAfterSecond).toBeGreaterThanOrEqual(countAfterFirst);
    await page.screenshot({ path: 'test-results/lazy-load-03-multi-select.png' });
  });

  test('4: deselect all — shows all loaded songs', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const streamerSwitcher = page.getByTestId('streamer-switcher');
    const hasMultiple = await streamerSwitcher.isVisible().catch(() => false);
    if (!hasMultiple) { test.skip(); return; }

    // Click first streamer → songs load
    const buttons = streamerSwitcher.locator('button');
    await buttons.nth(1).click();
    await expect(page.getByTestId('performance-row').first()).toBeVisible({ timeout: 15000 });
    const countBefore = await page.getByTestId('performance-row').count();
    expect(countBefore).toBeGreaterThan(0);

    // Click "All" to deselect
    await page.getByTestId('streamer-filter-all').click();
    await page.waitForTimeout(500);

    // Songs should still be visible (accumulated in memory, "All" shows everything)
    const countAfterAll = await page.getByTestId('performance-row').count();
    expect(countAfterAll).toBeGreaterThanOrEqual(countBefore);

    await page.screenshot({ path: 'test-results/lazy-load-04-deselect-all.png' });
  });

  test('5: single streamer — auto-load', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const streamerSwitcher = page.getByTestId('streamer-switcher');
    const hasMultiple = await streamerSwitcher.isVisible().catch(() => false);

    if (hasMultiple) {
      test.skip();
      return;
    }

    // Single streamer: songs should auto-load without user interaction
    await expect(page.getByTestId('performance-row').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'test-results/lazy-load-05-single-auto.png' });
  });
});
