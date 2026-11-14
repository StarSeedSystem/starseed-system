const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  // Don't wait for networkidle - just domcontentloaded
  await page.goto('https://starseed-os.vercel.app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(15000);
  
  // Find all tabs
  const tabs = await page.evaluate(() => {
    const elements = document.querySelectorAll('[role="tab"]');
    return Array.from(elements).map(el => ({
      label: el.getAttribute('aria-label'),
      selected: el.getAttribute('aria-selected'),
      text: el.innerText.trim(),
      pestana: el.closest('[data-pestana]')?.getAttribute('data-pestana')
    }));
  });
  console.log('Tabs:', JSON.stringify(tabs, null, 2));
  
  // Look for theme switcher
  const themeButtons = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    return Array.from(buttons).filter(b => {
      const text = b.innerText.toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return text.includes('tema') || text.includes('theme') || text.includes('dark') || text.includes('light') || 
             text.includes('noche') || text.includes('nieve') || aria.includes('tema') || aria.includes('theme');
    }).map(b => ({
      text: b.innerText,
      ariaLabel: b.getAttribute('aria-label'),
      class: b.className
    }));
  });
  console.log('Theme buttons:', JSON.stringify(themeButtons, null, 2));
  
  // Check localStorage for theme
  const storage = await page.evaluate(() => ({
    theme: localStorage.getItem('theme'),
    allKeys: Object.keys(localStorage)
  }));
  console.log('Storage:', JSON.stringify(storage, null, 2));
  
  // Get page screenshot for debugging
  await page.screenshot({ path: '/tmp/debug-home.png', fullPage: true });
  console.log('Screenshot saved to /tmp/debug-home.png');
  
  await browser.close();
})();
