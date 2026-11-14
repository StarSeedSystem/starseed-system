const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  await page.goto('https://starseed-os.vercel.app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  // Get all links
  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    return anchors.map(a => ({ href: a.href, text: a.innerText.trim() })).filter(x => x.text && x.href.startsWith('https://starseed-os.vercel.app'));
  });
  
  console.log('Links found:', links.length);
  links.forEach(l => console.log(`  ${l.href} -> ${l.text}`));
  
  // Check for theme toggle
  const themeInfo = await page.evaluate(() => {
    const html = document.documentElement;
    return {
      className: html.className,
      dataTheme: html.getAttribute('data-theme'),
      localStorage: localStorage.getItem('theme')
    };
  });
  console.log('Theme info:', themeInfo);
  
  await browser.close();
})();
