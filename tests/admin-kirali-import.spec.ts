import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const PROJECT_ROOT = process.cwd();

function restoreDataFiles() {
  execSync('git checkout -- data/songs.json data/streams.json data/metadata/', {
    cwd: PROJECT_ROOT,
  });
}

test.afterEach(() => restoreDataFiles());

test('Full auto-import workflow: login → dashboard → discover → auto-detect 14 songs from Kirali stream → import', async ({ page }) => {
  // 1. Login
  await page.goto('/admin/login');
  await page.getByTestId('username-input').fill('curator');
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin');
  await page.waitForTimeout(1000);

  // 2. Dashboard — click 匯入歌曲
  await page.getByTestId('discover-nav-button').click();
  await page.waitForURL('**/admin/discover');
  await page.waitForTimeout(500);

  // 3. Paste the YouTube URL and fetch video info
  await page.getByTestId('discover-url-input').fill('https://www.youtube.com/watch?v=n7Md8Z3MHAg');
  await page.getByTestId('discover-fetch-button').click();

  // 4. Wait for auto-extraction to complete (up to 30s — fetches YouTube page + comments)
  await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 30000 });

  // 5. Verify 14 songs are shown (indices 0-13)
  for (let i = 0; i < 14; i++) {
    await expect(page.getByTestId(`extracted-song-${i}`)).toBeVisible();
  }

  // 6. Import
  await page.getByTestId('import-button').click();
  await expect(page.getByText('匯入完成')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1000);

  // 7. Return to dashboard
  await page.getByText('返回管理面板').click();
  await page.waitForURL('**/admin');
  await page.waitForTimeout(1000);
});
