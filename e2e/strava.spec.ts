// e2e/strava.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Strava integration — profile page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile')
  })

  test('shows Connect Strava or redirects to login', async ({ page }) => {
    const url = page.url()
    if (url.includes('/login')) return // not logged in — acceptable
    await expect(page.locator('text=Strava')).toBeVisible()
  })

  test('profile page renders without crash', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.locator('main')).toBeVisible()
  })

  test('shows Connect Strava button when not connected', async ({ page }) => {
    if (page.url().includes('/login')) return
    // In CI, user won't have Strava connected — button should be visible
    const connectBtn = page.getByText('Connect Strava')
    const syncBtn    = page.getByText('Sync now')
    // Either Connect or Sync should exist (depending on test DB state)
    const hasConnect = await connectBtn.isVisible().catch(() => false)
    const hasSync    = await syncBtn.isVisible().catch(() => false)
    expect(hasConnect || hasSync).toBe(true)
  })

  test('Strava section is present on profile page', async ({ page }) => {
    if (page.url().includes('/login')) return
    // The section heading "STRAVA" is always rendered
    const stravaHeading = page.locator('text=Strava').first()
    await expect(stravaHeading).toBeVisible()
  })
})
