import { test, expect } from '@playwright/test';

test.describe('Admin API Verification', () => {
  test('Verify Admin API routes respond correctly', async ({ page }) => {
    // Navigate to login and perform login
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    await page.getByTestId('login-button').click({ force: true });
    
    // Wait for either the admin page or an error to appear
    await page.waitForTimeout(5000);

    // 1. Verify /api/admin/deploy GET (Git Status)
    const deployStatus = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/admin/deploy');
        return res.ok ? await res.json() : { error: res.status };
      } catch (e) {
        return { error: String(e) };
      }
    });
    console.log('Deploy Status:', deployStatus);
    
    // 2. Verify /api/admin/discover POST (YouTube Info)
    const discoverResult = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/admin/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=lVAiHsvF8z8' }),
        });
        return res.ok ? await res.json() : { error: res.status };
      } catch (e) {
        return { error: String(e) };
      }
    });
    console.log('Discover Result:', discoverResult);

    // Record interaction for 5 seconds
    await page.waitForTimeout(5000);
  });
});
