const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  await page.goto('https://starseed-os.vercel.app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(15000);
  
  // Close modals
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach(m => m.remove());
    document.querySelectorAll('.fixed.inset-0.z-\\[120\\]').forEach(b => b.remove());
  });
  await page.waitForTimeout(1000);
  
  // Try setting osTheme to light
  await page.evaluate(() => {
    const config = JSON.parse(localStorage.getItem('appearance-config-v2') || '{}');
    config.themeStore = config.themeStore || {};
    config.themeStore.osTheme = 'light';
    config.themeStore.activeMode = 'light';
    localStorage.setItem('appearance-config-v2', JSON.stringify(config));
    window.dispatchEvent(new StorageEvent('storage', { key: 'appearance-config-v2', newValue: JSON.stringify(config) }));
  });
  await page.waitForTimeout(3000);
  
  let htmlClass = await page.evaluate(() => document.documentElement.className);
  console.log('HTML class with osTheme=light:', htmlClass);
  
  let style = await page.evaluate(() => document.documentElement.getAttribute('style'));
  console.log('Style:', style);
  
  await page.screenshot({ path: '/tmp/osTheme-light.png', fullPage: false });
  
  // Try with a custom saved theme that has mode: light
  await page.evaluate(() => {
    const config = JSON.parse(localStorage.getItem('appearance-config-v2') || '{}');
    config.themeStore = config.themeStore || {};
    config.themeStore.savedThemes = [{
      id: 'nieve',
      name: 'Nieve',
      mode: 'light',
      styling: config.styling,
      background: config.background,
      // ... copy other relevant settings
    }];
    config.themeStore.activeMode = 'nieve';
    localStorage.setItem('appearance-config-v2', JSON.stringify(config));
    window.dispatchEvent(new StorageEvent('storage', { key: 'appearance-config-v2', newValue: JSON.stringify(config) }));
  });
  await page.waitForTimeout(3000);
  
  htmlClass = await page.evaluate(() => document.documentElement.className);
  console.log('HTML class with saved theme:', htmlClass);
  
  style = await page.evaluate(() => document.documentElement.getAttribute('style'));
  console.log('Style:', style);
  
  await page.screenshot({ path: '/tmp/saved-theme.png', fullPage: false });
  
  // Also try forcing light mode via CSS
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    document.documentElement.style.colorScheme = 'light';
  });
  await page.waitForTimeout(1000);
  
  htmlClass = await page.evaluate(() => document.documentElement.className);
  console.log('HTML class after forced light:', htmlClass);
  
  await page.screenshot({ path: '/tmp/forced-light.png', fullPage: false });
  
  await browser.close();
})();
