const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  await page.goto('https://starseed-os.vercel.app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  // Get page content
  const content = await page.content();
  console.log('Page title:', await page.title());
  
  // Look for navigation elements
  const nav = await page.evaluate(() => {
    const elements = document.querySelectorAll('nav, [role="navigation"], header, .navigation, .nav, menu');
    return Array.from(elements).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: el.innerText.substring(0, 200)
    }));
  });
  console.log('Navigation:', JSON.stringify(nav, null, 2));
  
  // Look for buttons/links that might navigate
  const buttons = await page.evaluate(() => {
    const elements = document.querySelectorAll('button, a, [role="button"]');
    return Array.from(elements).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: el.innerText.trim(),
      href: el.href || null
    })).filter(x => x.text && x.text.length < 100);
  });
  console.log('Buttons/Links:', JSON.stringify(buttons, null, 2));
  
  // Check for theme toggle button
  const themeToggle = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    return Array.from(buttons).filter(b => 
      b.innerText.toLowerCase().includes('tema') || 
      b.innerText.toLowerCase().includes('theme') ||
      b.innerText.toLowerCase().includes('dark') ||
      b.innerText.toLowerCase().includes('light') ||
      b.innerText.toLowerCase().includes('noche') ||
      b.innerText.toLowerCase().includes('nieve') ||
      b.getAttribute('aria-label')?.toLowerCase().includes('theme')
    ).map(b => ({
      text: b.innerText,
      ariaLabel: b.getAttribute('aria-label'),
      class: b.className
    }));
  });
  console.log('Theme toggles:', JSON.stringify(themeToggle, null, 2));
  
  // Full page text
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log('Body text (first 3000):', bodyText);
  
  await browser.close();
})();
