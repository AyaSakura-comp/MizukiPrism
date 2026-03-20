import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test('discover copy song list block appears and syncs after extraction', async ({ page }) => {
  // Login
  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 5000 });

  // Navigate to discover
  await page.getByTestId('discover-nav-button').click();
  await page.waitForURL('**/admin/discover', { timeout: 5000 });

  // Open manual paste mode
  await page.getByTestId('manual-mode-toggle').click();
  await expect(page.getByTestId('paste-text-input')).toBeVisible();

  // Fill in title and song list
  await page.getByTestId('manual-title-input').fill('Test Stream');
  await page.getByTestId('paste-text-input').fill(
    '0:01:30 好日和 / ヨルシカ\n0:06:00 夜に駆ける / YOASOBI\n0:11:00 春泥棒 / ヨルシカ'
  );

  // Extract
  await page.getByTestId('paste-extract-button').click();

  // Wait for songs to appear
  await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 15000 });

  // Verify copy block appears
  const copyBlock = page.getByTestId('song-list-copy-block');
  await expect(copyBlock).toBeVisible();

  // Verify formatted text contains songs
  const preText = copyBlock.locator('pre');
  const text = await preText.textContent() ?? '';
  expect(text).toContain('好日和');
  expect(text).toContain('ヨルシカ');
  expect(text).toContain('夜に駆ける');
  expect(text).toMatch(/01\./);
  expect(text).toMatch(/\//);

  // Click copy button and verify feedback
  const copyBtn = page.getByTestId('copy-song-list-button');
  await expect(copyBtn).toBeVisible();
  await copyBtn.click();
  await expect(copyBtn).toContainText('已複製！');

  // Feedback resets after 2s
  await expect(copyBtn).toContainText('複製', { timeout: 4000 });
});
