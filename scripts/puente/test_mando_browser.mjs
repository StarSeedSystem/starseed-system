import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
  console.log("Launching chromium...");
  const userDataDir = `/tmp/pw-user-data-${Date.now()}`;
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote'
    ],
    viewport: { width: 1440, height: 900 }
  });

  const page = context.pages()[0] || await context.newPage();

  const consoleLogs = [];
  const networkErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    console.log(`[BROWSER CONSOLE ${msg.type()}] ${text}`);
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message);
    console.error(`[PAGE ERROR] ${err.message}`);
  });

  page.on('requestfailed', req => {
    networkErrors.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    console.warn(`[NET FAIL] ${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
  });

  console.log("Navigating to http://localhost:9002/mando...");
  const resp = await page.goto('http://localhost:9002/mando', { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log("Response status:", resp ? resp.status() : 'null');

  await page.waitForTimeout(3000);

  const title = await page.title();
  console.log("Title:", title);

  // Take screenshot
  await page.screenshot({ path: '/tmp/mando-overview.png', fullPage: true });
  console.log("Saved /tmp/mando-overview.png");

  // Check interactive elements / tabs
  const tabElements = await page.$$eval('[role="tab"], button', els => 
    els.map(el => ({
      text: el.innerText.trim().replace(/\n+/g, ' '),
      role: el.getAttribute('role'),
      ariaSelected: el.getAttribute('aria-selected'),
      id: el.id,
      dataState: el.getAttribute('data-state')
    })).filter(e => e.text.length > 0)
  );

  console.log("\nFound Tabs & Action Buttons:");
  console.log(JSON.stringify(tabElements, null, 2));

  await context.close();
  console.log("Finished successfully.");
}

run().catch(err => {
  console.error("Fatal Playwright error:", err);
  process.exit(1);
});
