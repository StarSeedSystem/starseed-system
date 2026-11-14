import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import {
  VIEWPORT,
  THEMES,
  PAGES_TO_CAPTURE,
  BASE_URL,
  generateManifest,
  setTheme,
  capturePageAsPng,
  convertPngToWebP,
  optimizeWebP,
  getFileSizeKB
} from '../src/scripts/capturas.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CAPTURAS_DIR = join(__dirname, '..', 'assets', 'readme', 'capturas');
const OUTPUT_PREFIX = '';

async function main() {
  console.log('Iniciando captura de pantallas...');
  
  await fs.mkdir(CAPTURAS_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  
  const results = [];
  
  for (const pageConfig of PAGES_TO_CAPTURE) {
    const pageResults = { ...pageConfig, capturas: [] };
    
    for (const theme of THEMES) {
      const url = `${BASE_URL}${pageConfig.path}`;
      const webpFilename = `${OUTPUT_PREFIX}${pageConfig.name}-${theme}.webp`;
      const webpPath = join(CAPTURAS_DIR, webpFilename);
      const pngPath = webpPath.replace('.webp', '.png');
      
      console.log(`Capturando ${pageConfig.name} (${theme})...`);
      
      await setTheme(page, theme);
      await capturePageAsPng(page, url, pngPath);
      await convertPngToWebP(pngPath, webpPath, 80);
      await fs.unlink(pngPath).catch(() => {});
      
      let tamanoKB = await getFileSizeKB(webpPath);
      
      if (tamanoKB > 300) {
        console.warn(`⚠️  ${webpFilename} pesa ${tamanoKB} KB (>300 KB), optimizando...`);
        tamanoKB = await optimizeWebP(webpPath, 300);
        console.log(`   Nuevo tamaño: ${tamanoKB} KB`);
      }
      
      console.log(`   ✓ ${webpFilename} (${tamanoKB} KB)`);
      pageResults.capturas.push({ tema: theme, archivo: webpFilename, tamanoKB });
    }
    
    results.push(pageResults);
  }
  
  await browser.close();
  
  const manifest = generateManifest(PAGES_TO_CAPTURE, THEMES, OUTPUT_PREFIX);
  for (const pageResult of results) {
    const manifestEntry = manifest.find(m => m.pagina === pageResult.name);
    if (manifestEntry) {
      manifestEntry.capturas = pageResult.capturas;
    }
  }
  
  const manifestPath = join(CAPTURAS_DIR, 'capturas.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest guardado en ${manifestPath}`);
  
  console.log('\n✅ Capturas completadas:');
  for (const r of results) {
    for (const c of r.capturas) {
      console.log(`  ${r.name}/${c.tema}: ${c.archivo} (${c.tamanoKB} KB)`);
    }
  }
}

main().catch(async (err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});