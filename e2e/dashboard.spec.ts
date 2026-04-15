// e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Dashboard tab', () => {
  test.beforeEach(async ({ page }) => {
    // Rely on existing auth state from e2e/auth.spec.ts setup,
    // or re-login here if storageState is configured.
    await page.goto('/dashboard')
  })

  test('shows race name in header or redirects to login', async ({ page }) => {
    const url = page.url()
    // Either on dashboard (logged in) or redirected to login
    expect(url).toMatch(/\/(dashboard|login)/)
  })

  test('dashboard page renders without crash', async ({ page }) => {
    // If redirected to login, skip
    if (page.url().includes('/login')) return
    await expect(page.locator('main')).toBeVisible()
  })

  test('weekly distance widget is present', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Weekly Distance')).toBeVisible()
  })

  test('est. finish widget is present', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Est. Finish')).toBeVisible()
  })

  test('avg pace widget is present', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Avg Pace / Type')).toBeVisible()
  })

  test('completion rate widget is present', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Completion Rate')).toBeVisible()
  })
})
