import { describe, it, expect } from 'vitest';
import { OSS_LIBRARY, getLibrary, findOption } from '../oss-library';

describe('oss-library', () => {
  it('exporta el catálogo completo', () => {
    expect(getLibrary()).toBeDefined();
    expect(getLibrary().length).toBeGreaterThan(0);
  });

  describe('red mesh / señales / inferencia distribuida', () => {
    it('registra Red Mesh en /red-mesh', () => {
      const app = findOption('red-mesh');
      expect(app).toBeDefined();
      expect(app!.id).toBe('red-mesh');
      expect(app!.url).toBe('/red-mesh');
      expect(app!.category).toBe('app-platform');
    });

    it('registra Señales en /senales', () => {
      const app = findOption('senales');
      expect(app).toBeDefined();
      expect(app!.id).toBe('senales');
      expect(app!.url).toBe('/senales');
      expect(app!.category).toBe('app-platform');
    });

    it('registra la capacidad de inferencia distribuida local sin URL interna rota', () => {
      const cap = findOption('inferencia-distribuida-local');
      expect(cap).toBeDefined();
      expect(cap!.id).toBe('inferencia-distribuida-local');
      expect(cap!.category).toBe('runtime');
      expect(cap!.url).not.toBe('internal://inferencia-distribuida-local');
      expect(typeof cap!.url).toBe('string');
      expect(cap!.url.length).toBeGreaterThan(0);
    });
  });

  describe('validación de URLs válidas', () => {
    it('ninguna opción usa esquema internal: como href navegable', () => {
      for (const opt of OSS_LIBRARY) {
        if (opt.url.startsWith('internal:')) {
          expect(opt.url).not.toContain('internal://');
        }
      }
      const conInternal = OSS_LIBRARY.filter(o => o.url.startsWith('internal:'));
      expect(conInternal.length).toBe(0);
    });
  });
});
