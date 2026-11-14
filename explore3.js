const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  // Listen for console logs
  page.on('console', msg => console.log('Console:', msg.text()));
  page.on('pageerror', err => console.log('Page error:', err.message));
  
  await page.goto('https://starseed-os.vercel.app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(10000);
  
  // Check if there's a main content area
  const mainContent = await page.evaluate(() => {
    const main = document.querySelector('main, #main-content, [role="main"]');
    if (main) return main.innerHTML.substring(0, 5000);
    return 'No main element found';
  });
  console.log('Main content:', mainContent);
  
  // Check all visible elements
  const visibleElements = await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    return Array.from(elements)
      .filter(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && 
               style.display !== 'none' && 
               style.visibility !== 'hidden' &&
               style.opacity !== '0';
      })
      .map(el => ({
        tag: el.tagName,
        class: el.className,
        id: el.id,
        text: el.innerText.substring(0, 100),
        rect: el.getBoundingClientRect()
      }))
      .filter(x => x.text.trim().length > 0);
  });
  console.log('Visible elements:', JSON.stringify(visibleElements, null, 2));
  
  await browser.close();
})();
