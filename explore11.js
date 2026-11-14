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
  
  // Click settings button and then click "Sistema"
  const settingsBtn = await page.$('button[aria-label*="setting" i], button[aria-label*="config" i], button[aria-label*="ajuste" i]');
  if (settingsBtn) {
    await settingsBtn.click();
    await page.waitForTimeout(1000);
    
    // Click Sistema button
    const sistemaBtn = await page.$('button:has-text("Sistema")');
    if (sistemaBtn) {
      await sistemaBtn.click();
      await page.waitForTimeout(2000);
      
      // Get all content
      const panelContent = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"], [role="menu"]');
        let latest = null;
        let maxZ = -1;
        dialogs.forEach(d => {
          const z = parseInt(window.getComputedStyle(d).zIndex) || 0;
          if (z > maxZ) {
            maxZ = z;
            latest = d;
          }
        });
        return latest ? latest.innerText : 'No panel';
      });
      console.log('Sistema panel:', panelContent);
      
      // Look for theme
      const allButtons = await page.$$('button, [role="menuitem"], [role="option"]');
      for (const btn of allButtons) {
        const text = await btn.innerText();
        if (text.toLowerCase().includes('tema') || text.toLowerCase().includes('theme') || 
            text.toLowerCase().includes('apariencia') || text.toLowerCase().includes('appearance')) {
          console.log('Found theme button:', text);
          await btn.click();
          await page.waitForTimeout(1000);
          
          // Get submenu
          const subContent = await page.evaluate(() => {
            const menus = document.querySelectorAll('[role="menu"], [role="listbox"]');
            return Array.from(menus).map(m => m.innerText).join('\n');
          });
          console.log('Submenu:', subContent);
        }
      }
    }
  }
  
  // Try to create a light theme in savedThemes
  const appearance = await page.evaluate(() => {
    const config = JSON.parse(localStorage.getItem('appearance-config-v2') || '{}');
    // Add a light theme
    const lightTheme = {
      id: 'light-theme',
      name: 'Nieve',
      mode: 'light',
      ...config // inherit other settings
    };
    config.themeStore = config.themeStore || {};
    config.themeStore.savedThemes = [lightTheme];
    config.themeStore.activeMode = 'light';
    localStorage.setItem('appearance-config-v2', JSON.stringify(config));
    window.dispatchEvent(new StorageEvent('storage', { key: 'appearance-config-v2', newValue: JSON.stringify(config) }));
    return config.themeStore;
  });
  console.log('Theme store after adding light:', appearance);
  await page.waitForTimeout(3000);
  
  // Check if theme changed
  const htmlClass = await page.evaluate(() => document.documentElement.className);
  console.log('HTML class:', htmlClass);
  
  const style = await page.evaluate(() => document.documentElement.getAttribute('style'));
  console.log('Style:', style);
  
  await page.screenshot({ path: '/tmp/light-attempt.png', fullPage: false });
  
  await browser.close();
})();
