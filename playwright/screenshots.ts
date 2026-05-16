import { chromium, devices } from 'playwright';

(async () => {
  const iPhone = devices['iPhone 13'];
  const browser = await chromium.launch();
  const context = await browser.newContext(iPhone);
  const page = await context.newPage();

  // Go to the app
  await page.goto('https://check-95k.pages.dev'); // Use deployed site for screenshots

  // Always force viewport size for consistency
  // No need for setViewport, device emulation handles viewport


  // Step 1: Main page
  await page.screenshot({ path: 'playwright/step1-main.png' });

  // Step 1.5: Type 'a' into the input text box
  await page.type('input[type="text"]', 'a');
  await page.waitForTimeout(300);

  // Step 2: Open sidebar (simulate tap)
  await page.click('[data-sidebar="trigger"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'playwright/step2-sidebar.png' });

  // Step 3: Go to settings
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
  await page.screenshot({ path: 'playwright/step3-settings.png' });


  await browser.close();
})();
