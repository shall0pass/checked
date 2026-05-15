import { chromium, devices } from 'playwright';

(async () => {
  const iPhone = devices['iPhone 13'];
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...iPhone });
  const page = await context.newPage();

  // Go to the app
  await page.goto('http://localhost:5173'); // Adjust if your dev server runs elsewhere

  // Always force viewport size for consistency
  const setViewport = async () => {
    await page.setViewportSize({ width: 390, height: 844 });
  };

  // Step 1: Main page
  await setViewport();
  await page.screenshot({ path: 'playwright/step1-main.png' });

  // Step 2: Open sidebar (simulate tap)
  await setViewport();
  await page.click('[data-sidebar="trigger"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'playwright/step2-sidebar.png' });

  // Step 3: Go to settings
  await setViewport();
  // Ensure sidebar is open before clicking Settings
  if (!(await page.isVisible('text=Settings'))) {
    await page.click('[data-sidebar="trigger"]');
    await page.waitForTimeout(300);
  }
  await page.click('text=Settings');
  await page.waitForTimeout(500);
  // If the sidebar is open, close it before screenshot
  if (await page.isVisible('[data-sidebar="trigger"]')) {
    // Try clicking outside or pressing Escape to close sidebar if needed
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  await setViewport();
  await page.screenshot({ path: 'playwright/step3-settings.png' });

  // Step 4: Back to main (Shopping List)
  await setViewport();
  // Ensure sidebar is open before clicking Shopping List
  if (!(await page.isVisible('text=Shopping List'))) {
    await page.click('[data-sidebar="trigger"]');
    await page.waitForTimeout(300);
  }
  await page.click('text=Shopping List');
  await page.waitForTimeout(500);
  await setViewport();
  await page.screenshot({ path: 'playwright/step4-back-main.png' });

  await browser.close();
})();
