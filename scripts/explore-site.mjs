import { chromium } from 'playwright';

const pagesToCheck = [
  '/',
  '/instalar',
  '/dashboard',
  '/hub',
  '/hub?tab=calendar',
  '/publish',
  '/pizarra',
  '/publicar',
  '/login',
];

async function explorePage(browser, path) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`https://starseed-os.vercel.app${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const title = await page.title();
    const url = page.url();
    
    const isError = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('404') || text.includes('not found') || text.includes('no encontrad');
    });
    
    if (!isError && !url.includes('404')) {
      console.log(`\n=== ${path} ===`);
      console.log('Title:', title);
      console.log('URL:', url);
      
      const preview = await page.evaluate(() => {
        return document.body.innerText.slice(0, 800);
      });
      console.log('Preview:', preview);
      
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors.map(a => ({ href: a.href, text: a.innerText.trim() })).filter(x => x.text && x.href.startsWith('https://starseed-os.vercel.app'));
      });
      if (links.length > 0) {
        console.log('Links:', JSON.stringify(links, null, 2));
      }
      
      const themeButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        return buttons.map(b => ({ text: b.innerText.trim(), ariaLabel: b.getAttribute('aria-label') || '', class: b.className })).filter(x => x.text || x.ariaLabel);
      });
      console.log('Theme buttons:', JSON.stringify(themeButtons, null, 2));
    } else {
      console.log(`\n=== ${path} === 404/Error`);
    }
  } catch (e) {
    console.log(`\n=== ${path} === ERROR: ${e.message}`);
  } finally {
    await page.close();
  }
}

async function explore() {
  const browser = await chromium.launch({ headless: true });
  
  for (const path of pagesToCheck) {
    await explorePage(browser, path);
  }
  
  await browser.close();
}

explore().catch(console.error);