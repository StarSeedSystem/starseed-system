import { describe, it, expect } from 'vitest';
import { huellaContenido, construirManifiesto, divergencias, proponerLimpieza, resumenManifiesto, CopiaMemoria } from '../memoria-manifiesto';

describe('memoria-manifiesto', () => {
  it('huellaContenido debe ser consistente ignorando saltos de línea', async () => {
    const text1 = 'Hola\r\nMundo';
    const text2 = 'Hola\r\nMundo';
    const h1 = await huellaContenido(text1);
    const h2 = await huellaContenido(text2);
    expect(h1).toBe(h2);
  });

  it('construirManifiesto agrupa correctamente', () => {
    const copias: CopiaMemoria[] = [
      { cerebroId: '1', memoriaId: 'a', destino: 'local', huella: 'h1', bytes: 10, actualizadoMs: 1000 },
      { cerebroId: '1', memoriaId: 'a', destino: 'starseed', huella: 'h1', bytes: 10, actualizadoMs: 2000 },
    ];
    const m = construirManifiesto(copias);
    expect(m.huellas['h1'].copias.length).toBe(2);
    expect(m.huellas['h1'].destinos.size).toBe(2);
    expect(m.huellas['h1'].ultimaCopia.destino).toBe('starseed');
  });

  it('detecta divergencias', () => {
    const copias: CopiaMemoria[] = [
      { cerebroId: '1', memoriaId: 'a', destino: 'local', huella: 'h1', bytes: 10, actualizadoMs: 1000 },
      { cerebroId: '1', memoriaId: 'a', destino: 'starseed', huella: 'h2', bytes: 10, actualizadoMs: 2000 },
    ];
    const m = construirManifiesto(copias);
    const div = divergencias(m);
    expect(div.length).toBe(1);
    expect(div[0].huellaMasNueva).toBe('h2');
  });

  it('proponerLimpieza nunca incluye una última copia o destino local', () => {
    const copias: CopiaMemoria[] = [
      { cerebroId: '1', memoriaId: 'a', destino: 'local', huella: 'h1', bytes: 10, actualizadoMs: 1000 },
      { cerebroId: '1', memoriaId: 'a', destino: 'starseed', huella: 'h1', bytes: 10, actualizadoMs: 2000 },
      { cerebroId: '1', memoriaId: 'a', destino: 'gdrive', huella: 'h1', bytes: 10, actualizadoMs: 1500 },
    ];
    const m = construirManifiesto(copias);
    const propuestas = proponerLimpieza(m);
    // Solo debería sugerir quitar gdrive porque hay una copia más nueva en starseed
    expect(propuestas.length).toBe(1);
    expect(propuestas[0].destino).toBe('gdrive');
  });

  it('resumenManifiesto', () => {
    const copias: CopiaMemoria[] = [
      { cerebroId: '1', memoriaId: 'a', destino: 'local', huella: 'h1', bytes: 10, actualizadoMs: 1000 },
      { cerebroId: '1', memoriaId: 'b', destino: 'local', huella: 'h2', bytes: 10, actualizadoMs: 1000 },
      { cerebroId: '1', memoriaId: 'c', destino: 'local', huella: 'h3', bytes: 10, actualizadoMs: 1000 },
      { cerebroId: '2', memoriaId: 'a', destino: 'local', huella: 'h4', bytes: 10, actualizadoMs: 1000 },
      { cerebroId: '2', memoriaId: 'a', destino: 'starseed', huella: 'h4', bytes: 10, actualizadoMs: 1000 },
    ];
    const m = construirManifiesto(copias);
    const resumen = resumenManifiesto(m);
    expect(resumen).toBe('4 memorias, 3 con copia única, 0 divergente');
  });
});
