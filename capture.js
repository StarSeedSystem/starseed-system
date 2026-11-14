const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUTPUT_DIR = path.join(__dirname, 'assets', 'readme', 'capturas');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function closeModals(page) {
  await page.evaluate(() => {
    // Remove all modal dialogs and backdrops
    document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach(m => m.remove());
    document.querySelectorAll('.fixed.inset-0.z-\\[120\\]').forEach(b => b.remove());
    document.querySelectorAll('.fixed.inset-0.z-\\[100\\]').forEach(b => b.remove());
    // Also remove any element with backdrop-blur that covers the screen
    document.querySelectorAll('[style*="backdrop-blur"]').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.5) {
        el.remove();
      }
    });
  });
  await page.waitForTimeout(500);
}

async function setTheme(page, theme) {
  if (theme === 'noche') {
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
    });
  } else {
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
    });
  }
  await page.waitForTimeout(1500); // Wait for CSS transitions
}

async function clickTab(page, label) {
  await closeModals(page);
  const tab = await page.$(`[role="tab"][aria-label="${label}"]`);
  if (!tab) {
    throw new Error(`Tab "${label}" not found`);
  }
  await tab.click();
  await page.waitForTimeout(2000);
  await closeModals(page);
  await page.waitForTimeout(500);
}

async function captureScreen(page, name, theme) {
  const filename = `${name}-${theme}.png`;
  const filepath = path.join(OUTPUT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`Captured: ${filepath}`);
  return filepath;
}

async function convertToWebP(inputPath, outputPath, maxSizeKB = 300) {
  let quality = 80;
  let attempt = 0;
  
  while (attempt < 10) {
    await sharp(inputPath)
      .webp({ quality, effort: 6 })
      .toFile(outputPath);
    
    const stats = fs.statSync(outputPath);
    const sizeKB = stats.size / 1024;
    
    if (sizeKB <= maxSizeKB) {
      console.log(`  -> WebP: ${outputPath} (${sizeKB.toFixed(1)} KB, quality ${quality})`);
      return sizeKB;
    }
    
    quality -= 5;
    attempt++;
  }
  
  // If still too large, resize slightly
  await sharp(inputPath)
    .resize({ width: Math.round(2880 * 0.9) })
    .webp({ quality: 60, effort: 6 })
    .toFile(outputPath);
  
  const stats = fs.statSync(outputPath);
  console.log(`  -> WebP (resized): ${outputPath} (${(stats.size/1024).toFixed(1)} KB)`);
  return stats.size / 1024;
}

async function getScreenDescription(page, tabName) {
  const description = await page.evaluate(() => {
    const main = document.querySelector('main, [role="main"]');
    if (!main) return '';
    
    // Get key visible text elements
    const texts = [];
    const elements = main.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, button, [role="heading"]');
    elements.forEach(el => {
      const text = el.innerText.trim();
      if (text && text.length > 2 && text.length < 100 && !texts.includes(text)) {
        texts.push(text);
      }
    });
    return texts.slice(0, 10).join(' | ');
  });
  return description;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 2880, height: 1800 } });
  
  console.log('Loading https://starseed-os.vercel.app...');
  await page.goto('https://starseed-os.vercel.app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(15000);
  
  await closeModals(page);
  
  // Tabs to capture: Inicio, Política, Educación, Cultura (4 screens)
  const tabs = [
    { label: 'Inicio', name: 'inicio', description: 'Panel principal con clima, astronomía y accesos rápidos' },
    { label: 'Política', name: 'politica', description: 'Gobernanza y propuestas ciudadanas' },
    { label: 'Educación', name: 'educacion', description: 'Astraura y recursos educativos' },
    { label: 'Cultura', name: 'cultura', description: 'Biblioteca y lienzo cultural' }
  ];
  
  const capturas = [];
  
  for (const tab of tabs) {
    console.log(`\n--- Capturing ${tab.label} ---`);
    
    if (tab.label !== 'Inicio') {
      await clickTab(page, tab.label);
    } else {
      await closeModals(page);
      await page.waitForTimeout(1000);
    }
    
    // Get description
    const desc = await getScreenDescription(page, tab.label);
    const finalDesc = desc || tab.description;
    
    for (const theme of ['noche', 'nieve']) {
      console.log(`  Theme: ${theme}`);
      await setTheme(page, theme);
      
      const pngPath = await captureScreen(page, tab.name, theme);
      const webpPath = pngPath.replace('.png', '.webp');
      
      const sizeKB = await convertToWebP(pngPath, webpPath);
      
      // Remove PNG after conversion
      fs.unlinkSync(pngPath);
      
      capturas.push({
        archivo: path.basename(webpPath),
        pantalla: tab.label,
        tema: theme,
        descripcion: finalDesc,
        resolucion: '2880x1800',
        peso_kb: Math.round(sizeKB * 10) / 10
      });
    }
  }
  
  // Save capturas.json
  const jsonPath = path.join(OUTPUT_DIR, 'capturas.json');
  fs.writeFileSync(jsonPath, JSON.stringify(capturas, null, 2));
  console.log(`\nSaved capturas.json to ${jsonPath}`);
  console.log('\nCapturas summary:');
  capturas.forEach(c => {
    console.log(`  ${c.archivo}: ${c.pantalla} (${c.tema}) - ${c.peso_kb} KB`);
  });
  
  await browser.close();
})();
