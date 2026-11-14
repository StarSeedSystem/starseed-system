const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  await page.goto('https://starseed-os.vercel.app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(10000);
  
  // Find all tabs
  const tabs = await page.evaluate(() => {
    const tabs = document.querySelectorAll('[role="tab"], button[aria-label*="Pestaña"], button[aria-label*="Tab"]');
    return Array.from(tabs).map(t => ({
      label: t.getAttribute('aria-label') || t.innerText,
      selected: t.getAttribute('aria-selected'),
      text: t.innerText.trim()
    }));
  });
  console.log('Tabs:', JSON.stringify(tabs, null, 2));
  
  // Look for tab triggers
  const tabTriggers = await page.evaluate(() => {
    const elements = document.querySelectorAll('[data-pestana], [role="tab"]');
    return Array.from(elements).map(el => ({
      pestana: el.getAttribute('data-pestana'),
      role: el.getAttribute('role'),
      selected: el.getAttribute('aria-selected'),
      label: el.getAttribute('aria-label'),
      text: el.innerText.trim()
    }));
  });
  console.log('Tab triggers:', JSON.stringify(tabTriggers, null, 2));
  
  // Try to click on different tabs
  const tabButtons = await page.$$('[role="tab"]');
  console.log(`Found ${tabButtons.length} tab buttons`);
  
  for (let i = 0; i < Math.min(tabButtons.length, 8); i++) {
    try {
      const label = await tabButtons[i].getAttribute('aria-label');
      const text = await tabButtons[i].innerText();
      console.log(`Tab ${i}: ${label} - ${text}`);
    } catch (e) {
      console.log(`Tab ${i}: error getting info`);
    }
  }
  
  await browser.close();
})();
