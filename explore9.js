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
  
  // Check all saved themes
  const appearance = await page.evaluate(() => JSON.parse(localStorage.getItem('appearance-config-v2') || '{}'));
  console.log('Saved themes:', JSON.stringify(appearance.themeStore?.savedThemes, null, 2));
  console.log('Full themeStore:', JSON.stringify(appearance.themeStore, null, 2));
  
  // Try to find a theme selector in the UI - maybe in a settings panel
  const panels = await page.evaluate(() => {
    const elements = document.querySelectorAll('[role="dialog"], [role="menu"], .panel, .sidebar, .settings, [data-panel]');
    return Array.from(elements).map(el => ({
      role: el.getAttribute('role'),
      class: el.className,
      text: el.innerText.substring(0, 200)
    }));
  });
  console.log('Panels:', JSON.stringify(panels, null, 2));
  
  // Look for any element with "tema" or "theme" in text
  const themeTextElements = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    return Array.from(all).filter(el => {
      const text = (el.innerText || '').toLowerCase();
      return text.includes('tema') || text.includes('theme') || text.includes('noche') || text.includes('nieve') || text.includes('claro') || text.includes('oscuro');
    }).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: el.innerText.substring(0, 100)
    }));
  });
  console.log('Theme text elements:', JSON.stringify(themeTextElements, null, 2));
  
  // Try to find a settings button/menu
  const settingsBtn = await page.$('button[aria-label*="setting" i], button[aria-label*="config" i], button[aria-label*="ajuste" i], button[title*="setting" i], button[title*="config" i]');
  if (settingsBtn) {
    console.log('Found settings button');
    await settingsBtn.click();
    await page.waitForTimeout(2000);
    
    // Check for theme options in the menu
    const menuItems = await page.evaluate(() => {
      const items = document.querySelectorAll('[role="menuitem"], [role="option"], button, a');
      return Array.from(items).map(i => ({
        text: i.innerText,
        role: i.getAttribute('role'),
        class: i.className
      })).filter(x => x.text.toLowerCase().includes('tema') || x.text.toLowerCase().includes('theme') || x.text.toLowerCase().includes('apariencia'));
    });
    console.log('Theme menu items:', JSON.stringify(menuItems, null, 2));
  } else {
    console.log('No settings button found');
  }
  
  await browser.close();
})();
