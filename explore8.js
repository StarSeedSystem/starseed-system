const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  await page.goto('https://starseed-os.vercel.app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(15000);
  
  // Close any modal dialogs
  await page.evaluate(() => {
    const modals = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    modals.forEach(m => m.remove());
    const backdrops = document.querySelectorAll('.fixed.inset-0.z-\\[120\\]');
    backdrops.forEach(b => b.remove());
  });
  await page.waitForTimeout(1000);
  
  // Find theme toggle
  const themeElements = await page.evaluate(() => {
    const allButtons = document.querySelectorAll('button, [role="button"]');
    const candidates = [];
    allButtons.forEach(b => {
      const text = (b.innerText || '').toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const title = (b.getAttribute('title') || '').toLowerCase();
      if (text.includes('tema') || text.includes('theme') || text.includes('dark') || text.includes('light') ||
          text.includes('noche') || text.includes('nieve') || text.includes('apariencia') || text.includes('appearance') ||
          aria.includes('tema') || aria.includes('theme') || aria.includes('dark') || aria.includes('light') ||
          title.includes('tema') || title.includes('theme')) {
        candidates.push({
          text: b.innerText,
          ariaLabel: b.getAttribute('aria-label'),
          title: b.getAttribute('title'),
          class: b.className,
          tag: b.tagName
        });
      }
    });
    
    const selects = document.querySelectorAll('select');
    selects.forEach(s => {
      if ((s.innerText || '').toLowerCase().includes('tema') || (s.innerText || '').toLowerCase().includes('theme')) {
        candidates.push({
          text: s.innerText,
          tag: 'select',
          options: Array.from(s.options).map(o => o.text)
        });
      }
    });
    
    return candidates;
  });
  console.log('Theme elements:', JSON.stringify(themeElements, null, 2));
  
  // Check appearance config
  const appearance = await page.evaluate(() => JSON.parse(localStorage.getItem('appearance-config-v2') || '{}'));
  console.log('Theme store:', appearance.themeStore);
  
  // Try to set light mode
  await page.evaluate(() => {
    const appearance = JSON.parse(localStorage.getItem('appearance-config-v2') || '{}');
    appearance.themeStore = appearance.themeStore || {};
    appearance.themeStore.activeMode = 'light';
    localStorage.setItem('appearance-config-v2', JSON.stringify(appearance));
    window.dispatchEvent(new StorageEvent('storage', { key: 'appearance-config-v2', newValue: JSON.stringify(appearance) }));
  });
  await page.waitForTimeout(3000);
  
  const htmlClass = await page.evaluate(() => document.documentElement.className);
  console.log('HTML class in light:', htmlClass);
  
  await page.screenshot({ path: '/tmp/light-mode.png', fullPage: false });
  console.log('Light mode screenshot saved');
  
  // Switch back to dark
  await page.evaluate(() => {
    const appearance = JSON.parse(localStorage.getItem('appearance-config-v2') || '{}');
    appearance.themeStore = appearance.themeStore || {};
    appearance.themeStore.activeMode = 'primary';
    localStorage.setItem('appearance-config-v2', JSON.stringify(appearance));
    window.dispatchEvent(new StorageEvent('storage', { key: 'appearance-config-v2', newValue: JSON.stringify(appearance) }));
  });
  await page.waitForTimeout(3000);
  
  const htmlClass2 = await page.evaluate(() => document.documentElement.className);
  console.log('HTML class in dark:', htmlClass2);
  
  await page.screenshot({ path: '/tmp/dark-mode.png', fullPage: false });
  console.log('Dark mode screenshot saved');
  
  await browser.close();
})();
