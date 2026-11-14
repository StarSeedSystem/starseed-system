const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  await page.goto('https://starseed-os.vercel.app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(15000);
  
  // Check appearance config
  const appearance = await page.evaluate(() => localStorage.getItem('appearance-config-v2'));
  console.log('Appearance config:', appearance);
  
  // Try to find theme toggle in settings/menu
  const settingsBtns = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    return Array.from(buttons).filter(b => {
      const text = b.innerText.toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return text.includes('ajuste') || text.includes('config') || text.includes('setting') || 
             text.includes('menú') || text.includes('menu') || aria.includes('setting') || aria.includes('menu');
    }).map(b => ({
      text: b.innerText,
      ariaLabel: b.getAttribute('aria-label'),
      class: b.className
    }));
  });
  console.log('Settings buttons:', JSON.stringify(settingsBtns, null, 2));
  
  // Click on each main tab and capture
  const tabLabels = ['Inicio', 'Política', 'Educación', 'Cultura', 'Economía', 'Clima', 'Productividad', 'Ubicación'];
  
  for (const label of tabLabels) {
    try {
      const tab = await page.$(`[role="tab"][aria-label="${label}"]`);
      if (tab) {
        await tab.click();
        await page.waitForTimeout(3000);
        
        // Get visible content
        const content = await page.evaluate(() => {
          const main = document.querySelector('main, [role="main"]');
          return main ? main.innerText.substring(0, 500) : 'No main';
        });
        console.log(`\n--- ${label} ---`);
        console.log(content);
        
        // Screenshot
        await page.screenshot({ path: `/tmp/${label.toLowerCase()}.png`, fullPage: false });
      }
    } catch (e) {
      console.log(`Error with ${label}:`, e.message);
    }
  }
  
  await browser.close();
})();
