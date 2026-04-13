import { test, expect } from '@playwright/test'

const TEST_EMAIL = `percy-test-${Date.now()}@example.com`
const TEST_PASSWORD = 'TestPassword123!'

test.describe('Authentication', () => {
  test('register creates account and redirects to dashboard', async ({ page }) => {
    await page.goto('/register')

    await page.fill('input[type="email"]', TEST_EMAIL)
    await page.fill('input[id="password"]', TEST_PASSWORD)
    await page.fill('input[id="confirmPassword"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')

    // Should redirect to /dashboard (race setup modal will show)
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 })
  })

  test('login with correct credentials succeeds', async ({ page }) => {
    await page.goto('/login')

    await page.fill('input[type="email"]', TEST_EMAIL)
    await page.fill('input[type="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL('/dashboard', { timeout: 10000 })
  })

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login')

    await page.fill('input[type="email"]', TEST_EMAIL)
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    await expect(page.locator('[role="alert"]')).toBeVisible()
    await expect(page).toHaveURL('/login')
  })

  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login', { timeout: 5000 })
  })

  test('authenticated user on /login is redirected to /dashboard', async ({ page }) => {
    // Login first
    await page.goto('/login')
    await page.fill('input[type="email"]', TEST_EMAIL)
    await page.fill('input[type="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 })

    // Navigate to /login — should redirect back
    await page.goto('/login')
    await expect(page).toHaveURL('/dashboard', { timeout: 5000 })
  })
})
