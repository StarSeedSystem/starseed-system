const { chromium } = require('playwright');

(async () => {
  const userDataDir = '/tmp/chrome-persistent-debug-' + Date.now();
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-component-extensions-with-background-pages',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio'
    ]
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(String(err)));

  // Log network requests
  page.on('request', request => {
    // console.log('>>>', request.method(), request.url());
  });
  page.on('response', async response => {
    if (response.url().includes('/api/auth') || response.url().includes('/login')) {
      console.log(`[RESPONSE] ${response.status()} ${response.url()}`);
      const text = await response.text();
      console.log('[RESPONSE BODY]', text.substring(0, 200));
    }
  });

  console.log('Navigating to login...');
  await page.goto('http://localhost:9002/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });

  console.log('Filling login form...');
  await page.fill('input[name="email"]', 'prueba-hermes@star.seed');
  await page.fill('input[name="password"]', 'PruebaHermes2026!');
  await page.click('button[type="submit"]', { force: true });

  // Wait a bit and then examine the page
  await page.waitForTimeout(5000);
  console.log('Current URL:', page.url());
  const pageContent = await page.content();
  console.log('Page content length:', pageContent.length);
  // Look for common error messages
  const errorPatterns = [
    /error/i,
    /invalid/i,
    /incorrect/i,
    /failed/i,
    /try again/i
  ];
  for (const pattern of errorPatterns) {
    if (pattern.test(pageContent)) {
      console.log('Found error pattern:', pattern);
    }
  }
  // Look for buttons and their text
  const buttons = await page.$$('button');
  console.log('Number of buttons:', buttons.length);
  for (let i = 0; i < Math.min(buttons.length, 10); i++) {
    const btn = buttons[i];
    const text = await btn.textContent();
    console.log(`Button ${i}:`, text.trim());
  }
  // Look for links
  const links = await page.$$('a');
  console.log('Number of links:', links.length);
  for (let i = 0; i < Math.min(links.length, 10); i++) {
    const link = links[i];
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    console.log(`Link ${i}:`, text.trim(), '->', href);
  }
  // Take a screenshot for debugging
  await page.screenshot({ path: '/tmp/debug-login.png' });
  console.log('Screenshot saved to /tmp/debug-login.png');

  await browser.close();
})();
