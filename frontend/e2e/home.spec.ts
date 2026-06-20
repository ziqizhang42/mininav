import { expect, test } from '@playwright/test'

test('shows the map page', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'mininav' })).toBeVisible()

  await expect(page.getByLabel('Map of Alberta')).toBeVisible()
})
