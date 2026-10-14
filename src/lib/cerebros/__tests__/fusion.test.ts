import { describe, it, expect } from 'vitest';
import {
  ArchivoMemoria,
  PrefsCerebro,
  quitarFrontmatter,
  normalizar,
  planFusion,
  PlanFusion
} from '../fusion';

// Helper to create a mock Brain
const createMockBrain = (id: string, name: string, includesContent?: string, serversContent?: string, configContent?: string, prefsContent?: string): Brain => {
  return {
    id,
    owner: 'test-owner',
    name,
    scope: 'account',
    scope_ref: null,
    description: '',
    config: configContent ? JSON.parse(configContent) : {},
    includes: includesContent ? JSON.parse(includesContent) : {
      vaults: [],
      backends: [],
      personalities: [],
      runtimes: [],
      tokens: [],
      memories: [],
      connections: [],
      bindScope: false,
      permissions: [],
      aiProvider: undefined
    },
    servers: serversContent ? JSON.parse(serversContent) : [],
    created_at: undefined,
    updated_at: undefined
  };
};

// Helper to create an ArchivoMemoria
const createArchivoMemoria = (brainId: string, name: string, content: string, updatedAt?: string): ArchivoMemoria => {
  return {
    brain_id: brainId,
    name: name,
    content: content,
    updated_at: updatedAt ?? new Date().toISOString(),
    meta: null
  };
};

describe('fusion helpers', () => {
  describe('quitarFrontmatter', () => {
    it('should return unchanged text if no frontmatter', () => {
      expect(quitarFrontmatter('# Hello World')).toBe('# Hello World');
    });

    it('should remove frontmatter and following newlines', () => {
      const input = '---\ntype: memory\n---\n\n# Memoria\n\nHechos/estado genéricos.';
      const expected = '# Memoria\n\nHechos/estado genéricos.';
      expect(quitarFrontmatter(input)).toBe(expected);
    });

    it('should handle frontmatter with no trailing newlines', () => {
      const input = '---\ntype: memory\n---\n# Memoria';
      const expected = '# Memoria';
      expect(quitarFrontmatter(input)).toBe(expected);
    });

    it('should return original if frontmatter not closed', () => {
      const input = '---\ntype: memory\n\n# Memoria';
      expect(quitarFrontmatter(input)).toBe(input);
    });
  });

  describe('normalizar', () => {
    it('should normalize text', () => {
      const input = '---\ntype: memory\n---\n\n  #   Memoria  \n\n  Hechos/estado   genéricos.  ';
      const expected = '# Memoria Hechos/estado genéricos.';
      expect(normalizar(input)).toBe(expected);
    });

    it('should trim and collapse spaces', () => {
      expect(normalizar('  a   b  c  ')).toBe('a b c');
    });
  });
});

describe('planFusion', () => {
  const fecha = '2026-10-13';
  const prefs: Record<string, PrefsCerebro> = {};

  it('should handle empty inputs', () => {
    const result = planFusion({
      destino: createMockBrain('destino', 'Destino'),
      origenes: [],
      archivos: [],
      prefs,
      fecha
    });
    expect(result.archivos).toEqual([]);
    expect(result.resumen).toEqual({ archivosNuevos: 0, archivosAnexados: 0, archivosOmitidos: 0, bytes: 0 });
  });

  it('should copy a file when destino lacks it', () => {
    const destino = createMockBrain('destino', 'Destino');
    const origen = createMockBrain('origen', 'Origen');
    const archivo = createArchivoMemoria(origen.id, 'memoria.md', '---\ntype: memory\n---\n\n# Memoria\n\nContenido.');
    const archivos = [archivo];
    const result = planFusion({
      destino,
      origenes: [origen],
      archivos,
      prefs,
      fecha
    });
    expect(result.archivos.length).toBe(1);
    const filePlan = result.archivos[0];
    expect(filePlan.name).toBe('memoria.md');
    expect(filePlan.accion).toBe('copiar');
    expect(filePlan.contenido).toBe('# Memoria\n\nContenido.');
    expect(filePlan.bytesQueEntran).toBeGreaterThan(0);
    expect(filePlan.desde).toEqual([origen.id]);
    expect(filePlan.idDestino).toBeUndefined();
    expect(result.resumen.archivosNuevos).toBe(1);
    expect(result.resumen.bytes).toBeGreaterThan(0);
  });

  it('should omit file when content is equal after normalization', () => {
    const contenido = '---\ntype: memory\n---\n\n# Memoria\n\nContenido.';
    const destino = createMockBrain('destino', 'Destino', undefined, undefined, undefined, undefined);
    const origen = createMockBrain('origen', 'Origen', undefined, undefined, undefined, undefined);
    const destinoFile = createArchivoMemoria(destino.id, 'memoria.md', contenido);
    const origenFile = createArchivoMemoria(origen.id, 'memoria.md', contenido);
    const archivos = [destinoFile, origenFile];
    const result = planFusion({
      destino,
      origenes: [origen],
      archivos,
      prefs,
      fecha
    });
    expect(result.archivos.length).toBe(1);
    const filePlan = result.archivos[0];
    expect(filePlan.accion).toBe('omitir');
    expect(filePlan.bytesQueEntran).toBe(0);
    expect(filePlan.desde).toEqual([]);
    expect(result.resumen.archivosOmitidos).toBe(1);
    expect(result.resumen.bytes).toBe(0);
  });

  it('should append new sections when content differs', () => {
    const destinoContenido = '---\ntype: memory\n---\n\n# Memoria\n\nHechos antiguos.';
    const origenContenido = '---\ntype: memory\n---\n\n# Memoria\n\nHechos antiguos.\n\n## Actualización · 10/1\nNuevo hecho.';
    const destino = createMockBrain('destino', 'Destino', undefined, undefined, undefined, undefined);
    const origen = createMockBrain('origen', 'Origen', undefined, undefined, undefined, undefined);
    const archivoDestino = createArchivoMemoria(destino.id, 'memoria.md', destinoContenido);
    const archivoOrigen = createArchivoMemoria(origen.id, 'memoria.md', origenContenido);
    const archivos = [archivoDestino, archivoOrigen];
    const result = planFusion({
      destino,
      origenes: [origen],
      archivos,
      prefs,
      fecha
    });
    expect(result.archivos.length).toBe(1);
    const filePlan = result.archivos[0];
    expect(filePlan.accion).toBe('anexar');
    expect(filePlan.contenido).toContain('# Memoria\n\nHechos antiguos.');
    expect(filePlan.contenido).toContain(`## Fusionado de «Origen» (${origen.id.substring(0, 8)}) · 2026-10-13`);
    expect(filePlan.contenido).toContain('Nuevo hecho.');
    expect(filePlan.bytesQueEntran).toBeGreaterThan(0);
    expect(filePlan.desde).toEqual([origen.id]);
    expect(result.resumen.archivosAnexados).toBe(1);
    expect(result.resumen.bytes).toBeGreaterThan(0);
  });

  it('should not append duplicate sections', () => {
    const destinoContenido = '---\ntype: memory\n---\n\n# Memoria\n\nHechos antiguos.\n\n## Actualización · 10/1\nNuevo hecho.';
    const origenContenido = '---\ntype: memory\n---\n\n# Memoria\n\nHechos antiguos.\n\n## Actualización · 10/1\nNuevo hecho.';
    const destino = createMockBrain('destino', 'Destino', undefined, undefined, undefined, undefined);
    const origen = createMockBrain('origen', 'Origen', undefined, undefined, undefined, undefined);
    const archivoDestino = createArchivoMemoria(destino.id, 'memoria.md', destinoContenido);
    const archivoOrigen = createArchivoMemoria(origen.id, 'memoria.md', origenContenido);
    const archivos = [archivoDestino, archivoOrigen];
    const result = planFusion({
      destino,
      origenes: [origen],
      archivos,
      prefs,
      fecha
    });
    expect(result.archivos.length).toBe(1);
    const filePlan = result.archivos[0];
    expect(filePlan.accion).toBe('omitir');
    expect(filePlan.bytesQueEntran).toBe(0);
    expect(filePlan.desde).toEqual([]);
    expect(result.resumen.archivosOmitidos).toBe(1);
    expect(result.resumen.bytes).toBe(0);
  });
});