/**
 * E2E tests for Live Demo
 * Tests the complete user flow including search execution, vector display, and profiling
 */

import { test, expect } from '@playwright/test';

test.describe('Live Demo E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to live demo section
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display search controls on page load', async ({ page }) => {
    // Scroll to live demo section
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Verify search controls are visible
    await expect(page.locator('text=Execute kNN Search')).toBeVisible();
    await expect(page.locator('text=Top-K Results:')).toBeVisible();
    await expect(page.locator('text=Query Vector:')).toBeVisible();
    await expect(page.locator('text=Enable Profiling')).toBeVisible();
  });

  test('should open confirmation modal when search clicked', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Click search button
    await page.click('button:has-text("Execute kNN Search")');

    // Verify modal appears
    await expect(page.locator('text=Confirm kNN Search')).toBeVisible();
    await expect(page.locator('text=Execute kNN search with profiling')).toBeVisible();
    await expect(page.locator('text=Top-K results: 5')).toBeVisible();
    await expect(page.locator('text=Profiling: Enabled')).toBeVisible();
  });

  test('should close modal when cancel clicked', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await expect(page.locator('text=Confirm kNN Search')).toBeVisible();

    // Click cancel
    await page.click('button:has-text("Cancel")');

    // Modal should close
    await expect(page.locator('text=Confirm kNN Search')).not.toBeVisible();
  });

  test('should show loading state during search', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    // Should show loading state
    await expect(page.locator('text=Searching...')).toBeVisible();
  });

  test('should display results after successful search', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Execute search
    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    // Wait for results (may take a while for OSS download)
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Verify results are displayed
    await expect(page.locator('text=Search Completed')).toBeVisible();
    await expect(page.locator('text=Found 100 candidates')).toBeVisible();
    await expect(page.locator('text=doc0')).toBeVisible();
    await expect(page.locator('text=doc1')).toBeVisible();

    // Verify similarity scores are shown
    const scores = await page.locator('text=/0\\.9/').count();
    expect(scores).toBeGreaterThan(0);
  });

  test('should toggle SHOW VECTOR button correctly', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Execute search
    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    // Wait for results
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Find first SHOW VECTOR button
    const showVectorButton = page.locator('button:has-text("SHOW VECTOR")').first();
    await expect(showVectorButton).toBeVisible();

    // Click to show vector
    await showVectorButton.click();

    // Verify vector is displayed
    await expect(page.locator('text=Original Vector Data')).toBeVisible();
    await expect(page.locator('text=/\\d+ dimensions/')).toBeVisible();

    // Button should now say HIDE
    await expect(page.locator('button:has-text("HIDE")').first()).toBeVisible();

    // Click to hide
    await page.locator('button:has-text("HIDE")').first().click();

    // Vector should be hidden
    await expect(page.locator('text=Original Vector Data')).not.toBeVisible();
  });

  test('should display query vector after search', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Verify query vector is displayed
    await expect(page.locator('text=Query Vector')).toBeVisible();
    await expect(page.locator('text=/first 10 of \\d+ dimensions/')).toBeVisible();

    // Should show at least 10 vector values
    const vectorValues = await page.locator('text=/\\d+\\.\\d{4}').count();
    expect(vectorValues).toBeGreaterThanOrEqual(10);
  });

  test('should display timing breakdown when profiling enabled', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Make sure profiling is enabled
    const profilingCheckbox = page.locator('input[type="checkbox"]').first();
    const isChecked = await profilingCheckbox.isChecked();
    if (!isChecked) {
      await profilingCheckbox.check();
    }

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Verify timing section is displayed
    await expect(page.locator('text=Performance Profiling')).toBeVisible();
    await expect(page.locator('text=Total Query Time')).toBeVisible();

    // Check for timing stages
    await expect(page.locator('text=/Download|Load|Calc/')).toBeVisible();
  });

  test('should not display timing when profiling disabled', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Disable profiling
    const profilingCheckbox = page.locator('input[type="checkbox"]').first();
    await profilingCheckbox.uncheck();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Verify timing section is NOT displayed
    await expect(page.locator('text=Performance Profiling')).not.toBeVisible();
  });

  test('should update Top-K value', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    const topKInput = page.locator('input[type="number"]');

    // Clear and set new value
    await topKInput.fill('10');
    await topKInput.press('Tab');

    // Verify value changed
    const value = await topKInput.inputValue();
    expect(value).toBe('10');
  });

  test('should enforce Top-K limits', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    const topKInput = page.locator('input[type="number"]');

    // Test minimum limit
    await topKInput.fill('0');
    await topKInput.press('Tab');
    let value = await topKInput.inputValue();
    expect(value).toBe('1'); // Should clamp to minimum

    // Test maximum limit
    await topKInput.fill('100');
    await topKInput.press('Tab');
    value = await topKInput.inputValue();
    expect(value).toBe('50'); // Should clamp to maximum
  });

  test('should display correct metadata', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Verify metadata
    await expect(page.locator('text=/Query:.*vector from/')).toBeVisible();
    await expect(page.locator('text=/Dimensions: \\d+/')).toBeVisible();
    await expect(page.locator('text=/Total vectors: \\d+/')).toBeVisible();
    await expect(page.locator('text=/Top-K: \\d+ results/')).toBeVisible();
    await expect(page.locator('text=Similarity: Cosine')).toBeVisible();
  });

  test('should show Try Again button after search', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Verify Try Again button appears
    await expect(page.locator('button:has-text("Try Again")')).toBeVisible();
  });

  test('should allow multiple searches', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // First search
    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Click Try Again
    await page.click('button:has-text("Try Again")');
    await page.click('button:has-text("Confirm & Search")');

    // Second search should also complete
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });
    await expect(page.locator('text=Search Completed')).toBeVisible();
  });

  test('should enable Keep Current button after first search', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Initially Keep Current should be disabled
    const keepCurrentButton = page.locator('button:has-text("Keep Current")');
    await expect(keepCurrentButton).toBeDisabled();

    // Perform search
    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Keep Current should now be enabled
    await expect(keepCurrentButton).not.toBeDisabled();
  });

  test('should show error message on search failure', async ({ page }) => {
    // Mock search failure by intercepting the request
    await page.route('**/api/search', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Test error message',
          results: [],
          latency: 'N/A'
        })
      });
    });

    await page.locator('#live-demo').scrollIntoViewIfNeeded();
    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    // Should show error
    await expect(page.locator('text=Search Failed')).toBeVisible();
    await expect(page.locator('text=Test error message')).toBeVisible();
  });

  test('should display timing bars with correct values', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Look for timing values in format "Xms"
    const timingElements = await page.locator('text=/\\d+ms').all();
    expect(timingElements.length).toBeGreaterThan(5);
  });

  test('should expand only clicked result when multiple SHOW VECTOR clicked', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Click second SHOW VECTOR button
    const showVectorButtons = page.locator('button:has-text("SHOW VECTOR")');
    await showVectorButtons.nth(1).click();

    // Only one vector section should be visible
    const vectorSections = await page.locator('text=Original Vector Data').count();
    expect(vectorSections).toBe(1);
  });

  test('should handle confirmation modal backdrop click', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await expect(page.locator('text=Confirm kNN Search')).toBeVisible();

    // Click backdrop (outside modal)
    const modal = page.locator('.fixed.inset-0.bg-black\\/80');
    await modal.click();

    // Modal should close
    await expect(page.locator('text=Confirm kNN Search')).not.toBeVisible();
  });

  test('should show Profiling Enabled in metadata when profiling on', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Check for Profiling Enabled indicator
    await expect(page.locator('text=Profiling Enabled')).toBeVisible();
  });
});

test.describe('Live Demo Regression Tests', () => {
  test('regression: SHOW VECTOR button should not be broken', async ({ page }) => {
    // This test ensures the SHOW VECTOR button bug doesn't return
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Click SHOW VECTOR multiple times
    const showVectorButton = page.locator('button:has-text("SHOW VECTOR")').first();

    for (let i = 0; i < 3; i++) {
      await showVectorButton.click();

      if (i % 2 === 0) {
        // Should show vector
        await expect(page.locator('text=Original Vector Data')).toBeVisible();
      } else {
        // Should hide vector
        await expect(page.locator('text=Original Vector Data')).not.toBeVisible();
      }

      // Update button reference as it changes
      const updatedButton = page.locator('button:has-text("SHOW VECTOR"), button:has-text("HIDE")').first();
      await expect(updatedButton).toBeVisible();
    }
  });

  test('regression: timing values should not all be 0ms', async ({ page }) => {
    // This test ensures timing instrumentation returns actual values
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Look for any non-zero timing values
    const timingTexts = await page.locator('text=/\\d+ms').allTextContents();

    // Filter out 0ms values
    const nonZeroTimings = timingTexts.filter(t => t !== '0ms');

    // Should have at least some non-zero timing values
    expect(nonZeroTimings.length).toBeGreaterThan(0);
  });

  test('regression: Python syntax errors should not occur', async ({ page }) => {
    // This test ensures the Python script has correct syntax
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    // Should complete without "SyntaxError" or "Python error"
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Should NOT show error with syntax-related message
    const errorText = await page.locator('text=/SyntaxError|Python error/i').count();
    expect(errorText).toBe(0);
  });

  test('regression: try-except block should work correctly', async ({ page }) => {
    // This test ensures Python errors are caught and handled
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Even if search fails, should show error message (not crash)
    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');

    // Wait for either success or error
    await Promise.race([
      page.waitForSelector('text=Search Completed', { timeout: 60000 }),
      page.waitForSelector('text=Search Failed', { timeout: 60000 })
    ]);

    // Should show one of the two states
    const hasCompleted = await page.locator('text=Search Completed').count();
    const hasFailed = await page.locator('text=Search Failed').count();

    expect(hasCompleted + hasFailed).toBeGreaterThan(0);
  });
});

test.describe('Backfill Feature Tests', () => {
  test('should display backfill section after kNN search', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Execute kNN search
    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Verify backfill section is visible
    await expect(page.locator('text=Backfill Elasticsearch Documents')).toBeVisible();
    await expect(page.locator('text=Index ES documents with text fields for each Lance vector')).toBeVisible();
  });

  test('should show backfill button before execution', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Verify backfill button exists
    await expect(page.locator('button:has-text("Backfill ES Documents")')).toBeVisible();
  });

  test('should execute backfill and show results', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Click backfill button
    await page.click('button:has-text("Backfill ES Documents")');

    // Wait for backfill completion (may take time)
    await page.waitForSelector('text=Backfill Completed', { timeout: 90000 });

    // Verify backfill results
    await expect(page.locator('text=Backfill Completed')).toBeVisible();
    await expect(page.locator('text=/Indexed: \\d+/')).toBeVisible();
  });
});

test.describe('Hybrid Search Tests', () => {
  test('should switch to hybrid search mode', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Click hybrid search button
    await page.click('button:has-text("Hybrid Search")');

    // Verify hybrid search mode is active
    await expect(page.locator('text=Query Text:')).toBeVisible();

    // Verify query text input is visible
    await expect(page.locator('input[placeholder*="Enter search text"]')).toBeVisible();
  });

  test('should show query text input in hybrid mode', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Hybrid Search")');

    // Verify query text input exists and is enabled
    const queryInput = page.locator('input[placeholder*="Enter search text"]');
    await expect(queryInput).toBeVisible();
    await expect(queryInput).toBeEnabled();

    // Type query text
    await queryInput.fill('technology innovations');

    // Verify text was entered
    const value = await queryInput.inputValue();
    expect(value).toBe('technology innovations');
  });

  test('should execute hybrid search', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Switch to hybrid mode
    await page.click('button:has-text("Hybrid Search")');

    // Enter query text
    await page.fill('input[placeholder*="Enter search text"]', 'business trends');

    // Execute search
    await page.click('button:has-text("Execute Hybrid Search")');
    await page.click('button:has-text("Confirm & Search")');

    // Wait for results
    await page.waitForSelector('text=Search Completed', { timeout: 90000 });

    // Verify hybrid search results
    await expect(page.locator('text=/Text results: \\d+/')).toBeVisible();
    await expect(page.locator('text=/Vector results: \\d+/')).toBeVisible();
  });

  test('should hide query vector controls in hybrid mode', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Verify vector controls are visible in kNN mode
    await expect(page.locator('text=Query Vector:')).toBeVisible();
    await expect(page.locator('button:has-text("New Vector")')).toBeVisible();

    // Switch to hybrid mode
    await page.click('button:has-text("Hybrid Search")');

    // Vector controls should be hidden
    await expect(page.locator('text=Query Vector:')).not.toBeVisible();
  });

  test('should show fusion results in hybrid search', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Hybrid Search")');
    await page.fill('input[placeholder*="Enter search text"]', 'science research');

    await page.click('button:has-text("Execute Hybrid Search")');
    await page.click('button:has-text("Confirm & Search")');

    await page.waitForSelector('text=Search Completed', { timeout: 90000 });

    // Verify results show match type (TEXT/VECTOR/HYBRID)
    await expect(page.locator('text=/TEXT|VECTOR|HYBRID/')).toBeVisible();
  });
});

test.describe('Show/Hide Original Document Tests', () => {
  test('should show SHOW DOC button for each result', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Verify SHOW DOC buttons exist
    const showDocButtons = await page.locator('button:has-text("SHOW DOC")').count();
    expect(showDocButtons).toBeGreaterThan(0);
  });

  test('should toggle original document display', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Click SHOW DOC button
    await page.locator('button:has-text("SHOW DOC")').first().click();

    // Verify original document section is displayed
    await expect(page.locator('text=Original Document')).toBeVisible();

    // Verify document fields are shown
    await expect(page.locator('text=Primary Key')).toBeVisible();
    await expect(page.locator('text=Text Content')).toBeVisible();

    // Click HIDE DOC button
    await page.locator('button:has-text("HIDE DOC")').first().click();

    // Original document should be hidden
    await expect(page.locator('text=Original Document')).not.toBeVisible();
  });

  test('should display all document fields when shown', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    await page.locator('button:has-text("SHOW DOC")').first().click();

    // Verify all required fields are displayed
    await expect(page.locator('text=Primary Key (_id)')).toBeVisible();
    await expect(page.locator('text=Category')).toBeVisible();
    await expect(page.locator('text=Text Content')).toBeVisible();
    await expect(page.locator('text=Vector (first 10 dims)')).toBeVisible();
  });
});

test.describe('Show/Hide ES Request Tests', () => {
  test('should show Show ES Request button after search', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Verify Show ES Request button exists
    await expect(page.locator('button:has-text("Show ES Request")')).toBeVisible();
  });

  test('should display ES request JSON when clicked', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Click Show ES Request button
    await page.click('button:has-text("Show ES Request")');

    // Verify ES request JSON is displayed
    await expect(page.locator('text=Elasticsearch Request JSON')).toBeVisible();
    await expect(page.locator('text=query_vector')).toBeVisible();
    await expect(page.locator('text=num_candidates')).toBeVisible();

    // Verify button text changed to "Hide"
    await expect(page.locator('button:has-text("Hide ES Request")')).toBeVisible();
  });

  test('should hide ES request when toggled', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    await page.click('button:has-text("Execute kNN Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 60000 });

    // Show ES request
    await page.click('button:has-text("Show ES Request")');
    await expect(page.locator('text=Elasticsearch Request JSON')).toBeVisible();

    // Hide ES request
    await page.click('button:has-text("Hide ES Request")');
    await expect(page.locator('text=Elasticsearch Request JSON')).not.toBeVisible();
  });

  test('should show both text and vector queries for hybrid search', async ({ page }) => {
    await page.locator('#live-demo').scrollIntoViewIfNeeded();

    // Switch to hybrid mode
    await page.click('button:has-text("Hybrid Search")');
    await page.fill('input[placeholder*="Enter search text"]', 'test query');

    await page.click('button:has-text("Execute Hybrid Search")');
    await page.click('button:has-text("Confirm & Search")');
    await page.waitForSelector('text=Search Completed', { timeout: 90000 });

    // Show ES request
    await page.click('button:has-text("Show ES Request")');

    // Verify both text and vector queries are shown
    await expect(page.locator('text=Hybrid Search - Text Query')).toBeVisible();
    await expect(page.locator('text=Hybrid Search - Vector Query')).toBeVisible();
    await expect(page.locator('text=match')).toBeVisible(); // BM25 text query
    await expect(page.locator('text=knn')).toBeVisible(); // kNN vector query
  });
});
