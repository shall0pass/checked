import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 400, height: 800 }
  });
  const page = await context.newPage();

  // Step 1: Main page
  await page.goto('https://checked-95k.pages.dev/main');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'playwright/step1-main.png' });

  // Step 1a: Type 'a' into the input text box
  await page.fill('input[placeholder="Add occasional item"]', 'a');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'playwright/step1a-main.png' });

  // Step 2: Open sidebar (simulate tap)
  await page.click('[data-sidebar="trigger"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'playwright/step2-sidebar.png' });

  // Step 3: Go to settings
  await page.goto('https://checked-95k.pages.dev/settings');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'playwright/step3-settings.png' });

  await browser.close();
})();
