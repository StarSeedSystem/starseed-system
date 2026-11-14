const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 2880, height: 1800 } }); // 2x resolution
  
  await page.goto('https://starseed-os.vercel.app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(15000);
  
  // Close modals
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach(m => m.remove());
    document.querySelectorAll('.fixed.inset-0.z-\\[120\\]').forEach(b => b.remove());
  });
  await page.waitForTimeout(1000);
  
  // Force dark mode (default)
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
    document.documentElement.style.colorScheme = 'dark';
  });
  await page.waitForTimeout(2000);
  
  await page.screenshot({ path: '/tmp/dark-2x.png', fullPage: false });
  console.log('Dark 2x screenshot saved');
  
  // Check visual difference by getting pixel data
  const darkPixel = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 10; canvas.height = 10;
    const ctx = canvas.getContext('2d');
    // Can't easily get pixel data from page, but we can check computed styles
    const bg = getComputedStyle(document.body).backgroundColor;
    const color = getComputedStyle(document.body).color;
    return { bg, color };
  });
  console.log('Dark mode colors:', darkPixel);
  
  // Force light mode
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    document.documentElement.style.colorScheme = 'light';
  });
  await page.waitForTimeout(2000);
  
  const lightPixel = await page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const color = getComputedStyle(document.body).color;
    return { bg, color };
  });
  console.log('Light mode colors:', lightPixel);
  
  await page.screenshot({ path: '/tmp/light-2x.png', fullPage: false });
  console.log('Light 2x screenshot saved');
  
  // Now navigate to Política tab
  const politicaTab = await page.$('[role="tab"][aria-label="Política"]');
  if (politicaTab) {
    await politicaTab.click();
    await page.waitForTimeout(3000);
    
    // Close any new modals
    await page.evaluate(() => {
      document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach(m => m.remove());
      document.querySelectorAll('.fixed.inset-0.z-\\[120\\]').forEach(b => b.remove());
    });
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: '/tmp/politica-dark-2x.png', fullPage: false });
    console.log('Política dark screenshot saved');
    
    // Light mode
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
    });
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: '/tmp/politica-light-2x.png', fullPage: false });
    console.log('Política light screenshot saved');
  }
  
  // Navigate to Educación tab
  const educacionTab = await page.$('[role="tab"][aria-label="Educación"]');
  if (educacionTab) {
    await educacionTab.click();
    await page.waitForTimeout(3000);
    
    await page.evaluate(() => {
      document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach(m => m.remove());
      document.querySelectorAll('.fixed.inset-0.z-\\[120\\]').forEach(b => b.remove());
    });
    await page.waitForTimeout(1000);
    
    // Dark
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/educacion-dark-2x.png', fullPage: false });
    console.log('Educación dark screenshot saved');
    
    // Light
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/educacion-light-2x.png', fullPage: false });
    console.log('Educación light screenshot saved');
  }
  
  // Navigate to Cultura tab
  const culturaTab = await page.$('[role="tab"][aria-label="Cultura"]');
  if (culturaTab) {
    await culturaTab.click();
    await page.waitForTimeout(3000);
    
    await page.evaluate(() => {
      document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach(m => m.remove());
      document.querySelectorAll('.fixed.inset-0.z-\\[120\\]').forEach(b => b.remove());
    });
    await page.waitForTimeout(1000);
    
    // Dark
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/cultura-dark-2x.png', fullPage: false });
    console.log('Cultura dark screenshot saved');
    
    // Light
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/cultura-light-2x.png', fullPage: false });
    console.log('Cultura light screenshot saved');
  }
  
  await browser.close();
})();
