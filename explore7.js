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
  
  // Find theme toggle - look in various places
  const themeElements = await page.evaluate(() => {
    // Check for theme in localStorage appearance config
    const appearance = JSON.parse(localStorage.getItem('appearance-config-v2') || '{}');
    const themeStore = appearance.themeStore || {};
    console.log('Current themeStore:', themeStore);
    
    // Look for buttons that might control theme
    const allButtons = document.querySelectorAll('button, [role="button"]');
    const candidates = [];
    allButtons.forEach(b => {
      const text = b.innerText.toLowerCase();
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
    
    // Also check for select/dropdown
    const selects = document.querySelectorAll('select');
    selects.forEach(s => {
      if (s.innerText.toLowerCase().includes('tema') || s.innerText.toLowerCase().includes('theme')) {
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
  
  // Try to find theme in the appearance config and modify it
  const newTheme = await page.evaluate(() => {
    const appearance = JSON.parse(localStorage.getItem('appearance-config-v2') || '{}');
    appearance.themeStore = appearance.themeStore || {};
    appearance.themeStore.activeMode = 'light'; // Try light mode
    localStorage.setItem('appearance-config-v2', JSON.stringify(appearance));
    // Trigger storage event
    window.dispatchEvent(new StorageEvent('storage', { key: 'appearance-config-v2', newValue: JSON.stringify(appearance) }));
    return appearance.themeStore;
  });
  console.log('New theme store:', newTheme);
  await page.waitForTimeout(3000);
  
  // Check if theme changed
  const htmlClass = await page.evaluate(() => document.documentElement.className);
  console.log('HTML class after theme change:', htmlClass);
  
  // Screenshot in light mode
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
  console.log('HTML class after back to dark:', htmlClass2);
  
  await page.screenshot({ path: '/tmp/dark-mode.png', fullPage: false });
  console.log('Dark mode screenshot saved');
  
  await browser.close();
})();
