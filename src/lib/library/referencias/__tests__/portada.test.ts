import { describe, it, expect } from 'vitest';
import { portadaGenerada, portadaRemota } from '../portada';

describe('portadaGenerada', () => {
  const baseEntry = {
    url: 'https://example.com',
    nombre: 'Example',
    tipo: 'herramienta-ia',
    tema: 'ia-diseno',
    subtema: null,
    og_imagen: 'https://example.com/og.jpg',
    prohibido: []
  };

  it('returns degraded colors based on domain', () => {
    const entrada = baseEntry;
    const result = portadaGenerada(entrada);
    expect(result.degradado).toHaveLength(2);
    expect(result.degradado[0]).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    expect(result.degradado[1]).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    expect(result.degradado[0]).not.toBe(result.degradado[1]);
  });

  it('returns initials from name', () => {
    let entrada = { ...baseEntry, nombre: 'Higgsfield' };
    let result = portadaGenerada(entrada);
    expect(result.iniciales).toBe('HI');
    entrada = { ...baseEntry, nombre: 'The Claude Design Blueprint' };
    result = portadaGenerada(entrada);
    expect(result.iniciales).toBe('TC');
    entrada = { ...baseEntry, nombre: 'A' };
    result = portadaGenerada(entrada);
    expect(result.iniciales).toBe('AA');
  });

  it('returns icon based on tipo', () => {
    let entrada = { ...baseEntry, tipo: 'herramienta-ia' };
    let result = portadaGenerada(entrada);
    expect(result.icono).toBe('Bot');
    entrada = { ...baseEntry, tipo: 'guia-principios' };
    result = portadaGenerada(entrada);
    expect(result.icono).toBe('BookOpen');
    entrada = { ...baseEntry, tipo: 'tipo-desconocido' };
    result = portadaGenerada(entrada);
    expect(result.icono).toBe('BookOpen'); // default
  });
});

describe('portadaRemota', () => {
  const baseEntry = {
    url: 'https://example.com',
    nombre: 'Test',
    tipo: 'herramienta-ia',
    tema: 'ia-diseno',
    subtema: null,
    og_imagen: 'https://example.com/og.jpg',
    prohibido: []
  };

  it('returns og_imagen when abierta is true and no cach� in prohibido', () => {
    const entrada = { ...baseEntry, abierta: true };
    const result = portadaRemota(entrada, true);
    expect(result).toBe('https://example.com/og.jpg');
  });

  it('returns null when abierta is false', () => {
    const entrada = { ...baseEntry, abierta: false };
    const result = portadaRemota(entrada, false);
    expect(result).toBeNull();
  });

  it('returns null when prohibido includes cach�', () => {
    const entrada = {
      ...baseEntry,
      prohibido: ['caché', 'scraping']
    };
    const result = portadaRemota(entrada, true);
    expect(result).toBeNull();
  });

  it('returns null when og_imagen is null', () => {
    const entrada = {
      ...baseEntry,
      og_imagen: null
    };
    const result = portadaRemota(entrada, true);
    expect(result).toBeNull();
  });

  it('handles YouTube og_imagen (returns as is)', () => {
    const entrada = {
      ...baseEntry,
      og_imagen: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg'
    };
    const result = portadaRemota(entrada, true);
    expect(result).toBe('https://i.ytimg.com/vi/abc123/maxresdefault.jpg');
  });
});