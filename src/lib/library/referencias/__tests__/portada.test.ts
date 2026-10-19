import { describe, it, expect } from 'vitest';
import { portadaGenerada, portadaRemota } from './portada';

describe('portadaGenerada', () => {
  const entradaDePrueba = {
    nombre: 'Higgsfield',
    tipo: 'herramienta-ia',
    url: 'https://higgsfield.ai/mcp',
  };

  it('devuelve un objeto con degradado, iniciales y icono', () => {
    const resultado = portadaGenerada(entradaDePrueba);
    expect(typeof resultado).toBe('object');
    expect(Array.isArray(resultado.degradado)).toBe(true);
    expect(resultado.degradado.length).toBe(2);
    expect(typeof resultado.iniciales).toBe('string');
    expect(typeof resultado.icono).toBe('string');
  });

  it('degradado contiene dos colores HSL válidos', () => {
    const resultado = portadaGenerada(entradaDePrueba);
    expect(resultado.degradado[0]).toMatch(/^hsl\(/);
    expect(resultado.degradado[1]).toMatch(/^hsl\(/);
  });

  it('iniciales son correctos para el nombre dado', () => {
    const resultado = portadaGenerada(entradaDePrueba);
    // According to the iniciales function in src/lib/contactos/modelo.ts:
    // For a single word, it returns the first letter (uppercase).
    expect(resultado.iniciales).toBe('H');
  });

  it('icono es correcto para el tipo dado', () => {
    const resultado = portadaGenerada(entradaDePrueba);
    expect(resultado.icono).toBe('Brain');
  });

  it('es determinista: misma entrada produce mismos colores', () => {
    const resultado1 = portadaGenerada(entradaDePrueba);
    const resultado2 = portadaGenerada(entradaDePrueba);
    expect(resultado1.degradado).toEqual(resultado2.degradado);
    expect(resultado1.iniciales).toBe(resultado2.iniciales);
    expect(resultado1.icono).toBe(resultado2.icono);
  });
});

describe('portadaRemota', () => {
  const entradaSinProhibidoCaché = {
    og_imagen: 'https://example.com/og.png',
    prohibido: ['scraping', 'entrenar-ia'],
  };

  const entradaConProhibidoCaché = {
    og_imagen: 'https://example.com/og.png',
    prohibido: ['scraping', 'cache-mas-de-24h'],
  };

  const entradaSinOgImagen = {
    og_imagen: null,
    prohibido: [],
  };

  it('devuelve null si la tarjeta no está abierta', () => {
    const resultado = portadaRemota(entradaSinProhibidoCaché, false);
    expect(resultado).toBeNull();
  });

  it('devuelve null si la entrada prohíbe caché (aunque esté abierta)', () => {
    const resultado = portadaRemota(entradaConProhibidoCaché, true);
    expect(resultado).toBeNull();
  });

  it('devuelve el og_imagen si está abierta y no prohíbe caché', () => {
    const resultado = portadaRemota(entradaSinProhibidoCaché, true);
    expect(resultado).toBe('https://example.com/og.png');
  });

  it('devuelve null si og_imagen es null y está abierta y no prohíbe caché', () => {
    const resultado = portadaRemota(entradaSinOgImagen, true);
    expect(resultado).toBeNull();
  });
});