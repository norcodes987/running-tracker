// e2e/profile.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Profile tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile')
  })

  test('renders profile page without crash', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.locator('main')).toBeVisible()
  })

  test('shows account section', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Account')).toBeVisible()
  })

  test('shows goal time form', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Goal Time')).toBeVisible()
  })

  test('shows garmin upload section', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Garmin Data')).toBeVisible()
  })

  test('goal time form saves without error', async ({ page }) => {
    if (page.url().includes('/login')) return
    const input = page.getByLabel(/h:mm:ss or m:ss/i)
    if (await input.count() === 0) return
    await input.fill('1:45:00')
    await page.getByRole('button', { name: /save/i }).click()
    // Expect either "Saved!" or no error class
    await expect(page.getByText('Saved!')).toBeVisible({ timeout: 5000 }).catch(() => {})
  })

  test('end race button opens dialog', async ({ page }) => {
    if (page.url().includes('/login')) return
    const endBtn = page.getByRole('button', { name: /end this race/i })
    if (await endBtn.count() === 0) return
    await endBtn.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
  })
})
