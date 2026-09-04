const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(String(err)));
  
  // Navigate to login
  await page.goto('http://localhost:9002/login');
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });
  console.log('Login page loaded');
  
  // Try signup first (click the signup tab)
  await page.click('button[data-state="inactive"][aria-controls*="signup"]', { force: true, timeout: 10000 });
  await page.waitForTimeout(1000);
  
  // Fill in signup form
  await page.fill('input[name="email"]', 'prueba-hermes@star.seed');
  await page.fill('input[name="password"]', 'PruebaHermes2026!');
  // Check if there's a password confirmation field
  const passFields = await page.$$('input[name="password"]');
  if (passFields.length >= 2) {
    await passFields[1].fill('PruebaHermes2026!');
  }
  
  // Click signup button
  const submitBtn = await page.$('button[type="submit"]');
  console.log('Submit button text:', await submitBtn.textContent());
  await submitBtn.click({ force: true, timeout: 30000 });
  
  // Wait for navigation
  await page.waitForTimeout(5000);
  console.log('After signup URL:', page.url());
  console.log('Page title:', await page.title());
  
  // If got error, try login
  if (page.url().includes('/login')) {
    console.log('Still on login, trying to login instead...');
    // Click signin tab
    await page.click('button[data-state="active"][aria-controls*="signin"]', { force: true, timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.fill('input[name="email"]', 'prueba-hermes@star.seed');
    await page.fill('input[name="password"]', 'PruebaHermes2026!');
    await page.click('button[type="submit"]', { force: true, timeout: 30000 });
    await page.waitForTimeout(5000);
  }
  
  console.log('Final URL:', page.url());
  const cookies = await context.cookies();
  console.log('Has auth cookie:', cookies.some(c => c.name.includes('auth') || c.name.includes('sb-')));
  
  await browser.close();
  console.log('Done');
})();