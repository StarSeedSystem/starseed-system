import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CAPTURAS_DIR = join(__dirname, '..', '..', '..', 'assets', 'readme', 'capturas');
const SCRIPT_PATH = join(__dirname, '..', 'capturas.mjs');

describe('capturas.mjs', () => {
  let originalConsoleLog: (...args: unknown[]) => void;
  let originalConsoleError: (...args: unknown[]) => void;
  let logs: string[] = [];
  let errors: string[] = [];

  beforeEach(() => {
    logs = [];
    errors = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = (...args) => { logs.push(args.join(' ')); originalConsoleLog(...args); };
    console.error = (...args) => { errors.push(args.join(' ')); originalConsoleError(...args); };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('no debe exportar captureAll (es función de orquestación con Playwright, no pura)', async () => {
    const mod = await import(SCRIPT_PATH);
    expect(mod.captureAll).toBeUndefined();
  });

  it('debe exportar la configuración de páginas a capturar', async () => {
    const mod = await import(SCRIPT_PATH);
    expect(Array.isArray(mod.PAGES_TO_CAPTURE)).toBe(true);
    expect(mod.PAGES_TO_CAPTURE.length).toBeGreaterThanOrEqual(3);
    expect(mod.PAGES_TO_CAPTURE.length).toBeLessThanOrEqual(4);
  });

  it('cada página debe tener ruta, nombre y descripción', async () => {
    const mod = await import(SCRIPT_PATH);
    for (const page of mod.PAGES_TO_CAPTURE) {
      expect(page).toHaveProperty('path');
      expect(page).toHaveProperty('name');
      expect(page).toHaveProperty('description');
      expect(typeof page.path).toBe('string');
      expect(typeof page.name).toBe('string');
      expect(typeof page.description).toBe('string');
    }
  });

  it('debe exportar temas soportados: noche y nieve', async () => {
    const mod = await import(SCRIPT_PATH);
    expect(Array.isArray(mod.THEMES)).toBe(true);
    expect(mod.THEMES).toContain('noche');
    expect(mod.THEMES).toContain('nieve');
  });

  it('debe exportar configuración de viewport 2x', async () => {
    const mod = await import(SCRIPT_PATH);
    expect(mod.VIEWPORT).toEqual({ width: 2880, height: 1800 });
  });

  it('debe exportar función para cambiar tema', async () => {
    const mod = await import(SCRIPT_PATH);
    expect(typeof mod.setTheme).toBe('function');
  });

  it('debe exportar función para capturar una página como PNG', async () => {
    const mod = await import(SCRIPT_PATH);
    expect(typeof mod.capturePageAsPng).toBe('function');
  });

  it('debe generar capturas.json con metadata correcta', async () => {
    const mod = await import(SCRIPT_PATH);
    expect(typeof mod.generateManifest).toBe('function');
    
    const manifest = mod.generateManifest([
      { name: 'test', path: '/test', description: 'Test page' }
    ], ['noche', 'nieve'], 'test-');
    
    expect(Array.isArray(manifest)).toBe(true);
    expect(manifest.length).toBe(1);
    expect(manifest[0]).toHaveProperty('pagina', 'test');
    expect(manifest[0]).toHaveProperty('descripcion', 'Test page');
    expect(manifest[0].capturas).toHaveLength(2);
    expect(manifest[0].capturas[0]).toHaveProperty('tema', 'noche');
    expect(manifest[0].capturas[1]).toHaveProperty('tema', 'nieve');
    expect(manifest[0].capturas[0]).toHaveProperty('archivo');
    expect(manifest[0].capturas[0]).toHaveProperty('tamanoKB');
  });
});

describe('capturas.json existing', () => {
  it('debe existir y ser JSON válido', async () => {
    const path = join(CAPTURAS_DIR, 'capturas.json');
    const content = await fs.readFile(path, 'utf-8');
    const data = JSON.parse(content);
    expect(Array.isArray(data)).toBe(true);
  });

  it('debe tener al menos 3 páginas', async () => {
    const path = join(CAPTURAS_DIR, 'capturas.json');
    const content = await fs.readFile(path, 'utf-8');
    const data = JSON.parse(content);
    expect(data.length).toBeGreaterThanOrEqual(3);
  });

  it('cada página debe tener capturas para noche y nieve', async () => {
    const path = join(CAPTURAS_DIR, 'capturas.json');
    const content = await fs.readFile(path, 'utf-8');
    const data = JSON.parse(content);
    
    for (const page of data) {
      expect(page).toHaveProperty('pagina');
      expect(page).toHaveProperty('descripcion');
      expect(page).toHaveProperty('capturas');
      expect(Array.isArray(page.capturas)).toBe(true);
      
      const temas = page.capturas.map((c: { tema: string }) => c.tema);
      expect(temas).toContain('noche');
      expect(temas).toContain('nieve');
      
      for (const cap of page.capturas) {
        expect(cap).toHaveProperty('archivo');
        expect(cap).toHaveProperty('tamanoKB');
        expect(typeof cap.tamanoKB).toBe('number');
        expect(cap.tamanoKB).toBeLessThan(300);
      }
    }
  });

  it('los archivos WebP deben existir', async () => {
    const path = join(CAPTURAS_DIR, 'capturas.json');
    const content = await fs.readFile(path, 'utf-8');
    const data = JSON.parse(content);
    
    for (const page of data) {
      for (const cap of page.capturas) {
        const filePath = join(CAPTURAS_DIR, cap.archivo);
        const stats = await fs.stat(filePath);
        expect(stats.isFile()).toBe(true);
        expect(stats.size).toBeLessThan(300 * 1024);
      }
    }
  });
});