export const VIEWPORT = { width: 2880, height: 1800 };

export const THEMES = ['noche', 'nieve'];

export const PAGES_TO_CAPTURE = [
  {
    path: '/',
    name: 'inicio',
    description: 'Página de inicio de StarSeed OS con hero y acceso a la app'
  },
  {
    path: '/instalar',
    name: 'instalar',
    description: 'Página de instalación con opciones de descarga por plataforma'
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    description: 'Panel principal de la aplicación con información astrológica, meteorológica y calendario'
  },
  {
    path: '/pizarra',
    name: 'lienzo',
    description: 'Lienzo universal para conectar archivos, apps, widgets y ventanas'
  }
];

export const BASE_URL = 'https://starseed-os.vercel.app';

export function generateManifest(pages, themes, prefix = '') {
  return pages.map(page => ({
    pagina: page.name,
    descripcion: page.description,
    capturas: themes.map(tema => ({
      tema,
      archivo: `${prefix}${page.name}-${tema}.webp`,
      tamanoKB: 0
    }))
  }));
}

export async function setTheme(page, theme) {
  const themeButton = page.locator('button[aria-label="Aurora"], button[aria-label*="tema" i], button[aria-label*="theme" i]').first();
  if (await themeButton.count() > 0) {
    const currentTheme = await page.evaluate(() => document.documentElement.classList.contains('dark') ? 'noche' : 'nieve');
    if (currentTheme !== theme) {
      await themeButton.click();
      await page.waitForTimeout(500);
    }
  }
}

export async function getFileSizeKB(filePath) {
  const { stat } = await import('fs/promises');
  const stats = await stat(filePath);
  return Math.round(stats.size / 1024 * 10) / 10;
}

export async function capturePageAsPng(page, url, outputPath) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: outputPath, type: 'png', fullPage: false });
}

export async function convertPngToWebP(inputPath, outputPath, quality = 80) {
  const sharp = await import('sharp');
  await sharp.default(inputPath).webp({ quality, effort: 6 }).toFile(outputPath);
}

export async function optimizeWebP(inputPath, targetKB) {
  const sharp = await import('sharp');
  let quality = 70;
  let currentKB = await getFileSizeKB(inputPath);
  
  while (currentKB > targetKB && quality > 10) {
    await sharp.default(inputPath).webp({ quality, effort: 6 }).toFile(inputPath + '.tmp');
    await (await import('fs/promises')).rename(inputPath + '.tmp', inputPath);
    currentKB = await getFileSizeKB(inputPath);
    quality -= 5;
  }
  return currentKB;
}