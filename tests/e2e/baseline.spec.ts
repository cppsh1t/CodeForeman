// ── Baseline E2E smoke test ──
//
// This test validates the Playwright setup resolves and the test
// infrastructure is functional. Actual Electron app E2E tests
// will be added in downstream tasks once the app has runnable screens.

import { test, expect } from '@playwright/test'

test('playwright e2e infrastructure resolves', async ({ page }) => {
  // Navigate to a blank page to prove the browser launches
  await page.goto('about:blank')
  const title = await page.title()
  // about:blank has an empty title
  expect(title).toBe('')
})
