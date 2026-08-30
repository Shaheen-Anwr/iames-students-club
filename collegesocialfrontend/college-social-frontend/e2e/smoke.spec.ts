// Smoke E2E -- the "does the app boot and route" floor. Inert until `@playwright/test` is
// installed (see playwright.config.ts). Run: `npx playwright test`.
//
// These deliberately don't log in (no seeded test account yet). They assert the public shell:
// the login screen renders, the auth guard redirects unauthenticated deep links, and the
// offline fallback page is served. Add authenticated journeys once a test-user seed exists.
import { expect, test } from '@playwright/test';

test('login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle(/.+/);
  await expect(page.getByRole('button')).toBeVisible();
});

test('unauthenticated deep link redirects to /login', async ({ page }) => {
  await page.goto('/home');
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  expect(page.url()).toContain('/login');
});

test('offline fallback page is reachable', async ({ page }) => {
  const res = await page.goto('/offline.html');
  expect(res?.ok()).toBeTruthy();
  await expect(page.getByText('غير متصل')).toBeVisible();
});

test('register page renders', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('button')).toBeVisible();
});
