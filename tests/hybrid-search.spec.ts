import { test, expect } from '@playwright/test';

test('Hybrid Search UI', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  
  const hybridSection = page.locator('text=Hybrid Search').first();
  await expect(hybridSection).toBeVisible();
  await hybridSection.click();
  await page.waitForTimeout(500);
  
  const searchInput = page.locator('input[placeholder*="search"], input[type="text"]').first();
  await searchInput.fill('machine learning');
  await page.waitForTimeout(500);
  
  const searchButton = page.locator('button:has-text("Search")').first();
  await searchButton.click();
  await page.waitForTimeout(10000);
  
  await page.screenshot({ path: 'test-results/hybrid-search-screenshot.png', fullPage: true });
  
  const hasResults = await page.locator('text=Results:').count() > 0;
  console.log('Has results:', hasResults);
  expect(hasResults).toBeTruthy();
});
