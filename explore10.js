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
  
  // Click settings button
  const settingsBtn = await page.$('button[aria-label*="setting" i], button[aria-label*="config" i], button[aria-label*="ajuste" i]');
  if (settingsBtn) {
    await settingsBtn.click();
    await page.waitForTimeout(2000);
    
    // Get all content in the settings panel
    const panelContent = await page.evaluate(() => {
      // Find the most recent dialog or panel
      const dialogs = document.querySelectorAll('[role="dialog"], [role="menu"], .fixed, .panel');
      let latest = null;
      let maxZ = -1;
      dialogs.forEach(d => {
        const z = parseInt(window.getComputedStyle(d).zIndex) || 0;
        if (z > maxZ) {
          maxZ = z;
          latest = d;
        }
      });
      return latest ? latest.innerText : 'No panel found';
    });
    console.log('Settings panel content:', panelContent);
    
    // Look for theme options
    const themeOptions = await page.evaluate(() => {
      const all = document.querySelectorAll('button, [role="menuitem"], [role="option"], a, label, input');
      return Array.from(all).filter(el => {
        const text = (el.innerText || '').toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        return text.includes('tema') || text.includes('theme') || text.includes('noche') || text.includes('nieve') || 
               text.includes('claro') || text.includes('oscuro') || text.includes('dark') || text.includes('light') ||
               text.includes('apariencia') || text.includes('appearance');
      }).map(el => ({
        tag: el.tagName,
        text: el.innerText,
        ariaLabel: el.getAttribute('aria-label'),
        type: el.type,
        class: el.className
      }));
    });
    console.log('Theme options in settings:', JSON.stringify(themeOptions, null, 2));
    
    // Screenshot of settings
    await page.screenshot({ path: '/tmp/settings-panel.png', fullPage: false });
  }
  
  // Also try to find theme via CSS variables or data attributes
  const themeData = await page.evaluate(() => {
    const html = document.documentElement;
    return {
      className: html.className,
      dataTheme: html.getAttribute('data-theme'),
      style: html.getAttribute('style'),
      cssVars: {
        '--color-background': getComputedStyle(html).getPropertyValue('--color-background'),
        '--color-foreground': getComputedStyle(html).getPropertyValue('--color-foreground')
      }
    };
  });
  console.log('Theme data:', JSON.stringify(themeData, null, 2));
  
  await browser.close();
})();
