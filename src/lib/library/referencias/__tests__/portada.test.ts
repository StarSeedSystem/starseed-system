import { describe, it, expect } from 'vitest';
import { portadaGenerada, portadaRemota } from '../portada';
import { ReferenciaEntrada } from '../types';

describe('portadaGenerada', () => {
  const entradaMock: ReferenciaEntrada = {
    id: 'test',
    nombre: 'Test Nombre',
    url: 'https://example.com',
    tema: 'ia-diseno',
    subtema: null,
    que_es: 'Test',
    tipo: 'herramienta-ia',
    acceso: 'libre',
    clase_uso: 'reutilizable',
    condiciones: 'Test',
    canales: ['navegador-de-la-persona'],
    prohibido: [],
    actualizacion: [],
    integracion: [],
    terminos: null,
    og_imagen: 'https://example.com/og.jpg',
    verificado: '2026-10-18',
    sin_verificar: [],
  };

  it('should return a valid portada object', () => {
    const resultado = portadaGenerada(entradaMock);
    expect(resultado).toHaveProperty('degradado');
    expect(resultado.degradado).toBeInstanceOf(Array);
    expect(resultado.degradado.length).toBe(2);
    expect(resultado.degradado[0]).toMatch(/^#[0-9A-F]{6}$/i);
    expect(resultado.degradado[1]).toMatch(/^#[0-9A-F]{6}$/i);
    expect(resultado.iniciales).toBe('TN');
    expect(resultado.icono).toBe('Sparkles');
  });

  it('should handle single word name', () => {
    const entrada = { ...entradaMock, nombre: 'Test' };
    const resultado = portadaGenerada(entrada);
    expect(resultado.iniciales).toBe('TE'); // first two letters
  });

  it('should handle empty name', () => {
    const entrada = { ...entradaMock, nombre: '' };
    const resultado = portadaGenerada(entrada);
    expect(resultado.iniciales).toBe('??');
  });

  it('should produce deterministic colors for same domain', () => {
    const entrada1 = { ...entradaMock, url: 'https://example.com' };
    const entrada2 = { ...entradaMock, url: 'https://example.com' };
    const resultado1 = portadaGenerada(entrada1);
    const resultado2 = portadaGenerada(entrada2);
    expect(resultado1.degradado).toEqual(resultado2.degradado);
  });

  it('should produce different colors for different domains', () => {
    const entrada1 = { ...entradaMock, url: 'https://example.com' };
    const entrada2 = { ...entradaMock, url: 'https://otro.com' };
    const resultado1 = portadaGenerada(entrada1);
    const resultado2 = portadaGenerada(entrada2);
    // Not strictly guaranteed but very likely
    expect(resultado1.degradado).not.toEqual(resultado2.degradado);
  });

  it('should get icon from tema', () => {
    const entrada = { ...entradaMock, tema: 'movimiento' };
    const resultado = portadaGenerada(entrada);
    expect(resultado.icono).toBe('Wind');
  });

  it('should fallback to Sparkles for unknown tema', () => {
    const entrada = { ...entradaMock, tema: 'tema-desconocido' };
    const resultado = portadaGenerada(entrada);
    expect(resultado.icono).toBe('Sparkles');
  });
});

describe('portadaRemota', () => {
  const entradaBase: ReferenciaEntrada = {
    id: 'test',
    nombre: 'Test',
    url: 'https://example.com',
    tema: 'ia-diseno',
    subtema: null,
    que_es: 'Test',
    tipo: 'herramienta-ia',
    acceso: 'libre',
    clase_uso: 'reutilizable',
    condiciones: 'Test',
    canales: ['navegador-de-la-persona'],
    prohibido: [],
    actualizacion: [],
    integracion: [],
    terminos: null,
    og_imagen: 'https://example.com/og.jpg',
    verificado: '2026-10-18',
    sin_verificar: [],
  };

  it('should return null if not opened', () => {
    const resultado = portadaRemota(entradaBase, false);
    expect(resultado).toBeNull();
  });

  it('should return og_imagen if opened and no cache prohibition', () => {
    const entrada = { ...entradaBase, abierta: true };
    const resultado = portadaRemota(entrada, true);
    expect(resultado).toBe('https://example.com/og.jpg');
  });

  it('should return null if prohibited includes caché', () => {
    const entrada = {
      ...entradaBase,
      prohibido: ['scraping', 'caché'],
    };
    const resultado = portadaRemota(entrada, true);
    expect(resultado).toBeNull();
  });

  it('should return null if prohibited does not include caché but other prohibitions', () => {
    const entrada = {
      ...entradaBase,
      prohibido: ['scraping', 'entrenar-ia'],
    };
    const resultado = portadaRemota(entrada, true);
    expect(resultado).toBe('https://example.com/og.jpg');
  });

  it('should handle null og_imagen', () => {
    const entrada = { ...entradaBase, og_imagen: null };
    const resultado = portadaRemota(entrada, true);
    expect(resultado).toBeNull();
  });

  it('should handle empty og_imagen', () => {
    const entrada = { ...entradaBase, og_imagen: '' };
    const resultado = portadaRemota(entrada, true);
    expect(resultado).toBe(''); // empty string is still returned
  });
});