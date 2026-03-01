import { test, expect } from '@playwright/test';

test('Debug Admin Dashboard', async ({ page }) => {
  // 1. Login
  await page.goto('/admin/login');
  await page.getByTestId('username-input').fill('curator');
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click({ force: true });
  
  // 2. Wait for navigation
  await page.waitForTimeout(5000);
  
  // 3. Take screenshot to see what's happening
  await page.screenshot({ path: 'videos/debug-admin.png' });
  
  // 4. Try to find any element
  const body = await page.innerHTML('body');
  console.log('Body snippet:', body.slice(0, 500));
});
