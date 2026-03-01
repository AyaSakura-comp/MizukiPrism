import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const PROJECT_ROOT = process.cwd();

function restoreDataFiles() {
  execSync('git checkout -- data/songs.json data/streams.json data/metadata/', {
    cwd: PROJECT_ROOT,
  });
}

test.describe.serial('Fan-facing regression with video', () => {
  test.afterAll(() => {
    restoreDataFiles();
  });

  test('BEFORE: record fan catalog baseline', async ({ page }) => {
    // Navigate to fan-facing catalog
    await page.goto('/');
    await page.waitForSelector('[data-testid="performance-row"]', { timeout: 10000 });

    // Scroll through the catalog so video captures the full layout
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Interact with UI elements to record normal behavior
    // Click first song to show it's playable
    const firstRow = page.getByTestId('performance-row').first();
    await firstRow.click();
    await page.waitForTimeout(2000);

    // Video file: test-results/...-BEFORE-record-fan-catalog-baseline/video.webm
  });

  test('MIDDLE: perform admin import', async ({ page }) => {
    // Login to admin
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    await page.getByTestId('login-button').click();
    await page.waitForURL('**/admin');

    // Navigate to discover and import a test stream
    await page.goto('/admin/discover');
    await page.getByTestId('manual-mode-toggle').click();
    await page.getByTestId('manual-title-input').fill('Regression Test Stream');
    await page.getByTestId('paste-text-input').fill(
      '0:01:00 RegressionTestSong / RegressionTestArtist'
    );
    await page.getByTestId('paste-extract-button').click();
    await expect(page.getByTestId('extracted-song-0')).toBeVisible();
    await page.getByTestId('import-button').click();
    await expect(page.getByText('匯入完成')).toBeVisible({ timeout: 10000 });
  });

  test('AFTER: record fan catalog post-import', async ({ page }) => {
    // Same interactions as BEFORE test — navigate and scroll the catalog
    await page.goto('/');
    await page.waitForSelector('[data-testid="performance-row"]', { timeout: 10000 });

    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    const firstRow = page.getByTestId('performance-row').first();
    await firstRow.click();
    await page.waitForTimeout(2000);

    // Video file: test-results/...-AFTER-record-fan-catalog-post-import/video.webm
  });
});
