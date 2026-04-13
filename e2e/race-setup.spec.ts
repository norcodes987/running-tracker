import { test, expect } from '@playwright/test'

const EMAIL    = `percy-setup-${Date.now()}@example.com`
const PASSWORD = 'SetupTest123!'

// Calculate dates
function futureDate(daysAhead: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

test.describe('Race Setup', () => {
  test.beforeEach(async ({ page }) => {
    // Register fresh user
    await page.goto('/register')
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[id="password"]', PASSWORD)
    await page.fill('input[id="confirmPassword"]', PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 })
  })

  test('race setup modal shows after registration', async ({ page }) => {
    // Dialog should be visible
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    // Step 1 title should show
    await expect(page.getByText('Your Race')).toBeVisible()
  })

  test('completes all 3 steps and generates training plan', async ({ page }) => {
    const raceDate = futureDate(90)
    const startDate = futureDate(1)

    // Step 1
    await page.fill('input[placeholder*="ASICS"]', 'Test Marathon')
    await page.fill('input[type="date"]:first-of-type', raceDate)
    // Select distance
    await page.locator('[role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Half Marathon' }).click()
    await page.fill('input[placeholder*="Melbourne"]', 'Sydney, Australia')
    await page.fill('input[type="date"]:last-of-type', startDate)
    await page.click('button:has-text("Next")')

    // Step 2
    await expect(page.getByText('Goal & Fitness')).toBeVisible()
    await page.fill('input[placeholder="1:40:00"]', '1:45:00')
    await page.locator('[role="combobox"]').first().click()
    await page.getByRole('option', { name: /Building base/ }).click()
    await page.click('button:has-text("Next")')

    // Step 3
    await expect(page.getByText('Physiological Data')).toBeVisible()
    await page.fill('input[placeholder="32"]', '28')
    await page.click('button:has-text("Build my plan")')

    // Should redirect to dashboard with race loaded
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 })
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Test Marathon')).toBeVisible()
  })

  test('modal cannot be dismissed with escape', async ({ page }) => {
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[role="dialog"]')).toBeVisible()
  })
})
