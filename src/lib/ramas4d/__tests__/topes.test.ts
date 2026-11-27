import { describe, it, expect } from 'vitest';
import {
  TOPE_CUERPOS,
  topeCuerpos,
  topesEscena,
  cuadrosPorSegundo,
  seleccionarVisibles,
  parsearHsl,
} from '../topes';

describe('topes de la escena Ramas 4D', () => {
  it('fija los cuerpos visibles por tier del aparato', () => {
    expect(TOPE_CUERPOS).toEqual({ high: 5000, mid: 1500, low: 400 });
    expect(topeCuerpos('low')).toBe(400);
  });

  it('en alto no limita cuadros; en eco 30 y en eficiente 10', () => {
    expect(cuadrosPorSegundo('alto', false)).toBe(0);
    expect(cuadrosPorSegundo('eco', false)).toBe(30);
    expect(cuadrosPorSegundo('eficiente', false)).toBe(10);
  });

  it('pausa sin uso solo en eco y eficiente', () => {
    expect(cuadrosPorSegundo('eco', true)).toBe(-1);
    expect(cuadrosPorSegundo('eficiente', true)).toBe(-1);
    expect(cuadrosPorSegundo('alto', true)).toBe(0);
  });

  it('el modo no quita cuerpos: solo el tier los topa', () => {
    const a = topesEscena({ tier: 'mid', modo: 'alto', sinUso: false });
    const b = topesEscena({ tier: 'mid', modo: 'eficiente', sinUso: false });
    expect(b.maxCuerpos).toBe(a.maxCuerpos);
    expect(b.cuadros).toBe(10);
    expect(b.maxParticulas).toBeLessThanOrEqual(a.maxParticulas);
  });

  it('seleccionarVisibles respeta el tope, prioriza peso y conserva los forzados', () => {
    const pesos = [0.1, 0.9, 0.5, 0.7, 0.2];
    const v = seleccionarVisibles(pesos, 3, [0]);
    expect(v).toHaveLength(3);
    expect(v).toContain(0);
    expect(v).toContain(1);
    expect(v).not.toContain(4);
  });

  it('seleccionarVisibles devuelve todos si caben y nada con tope 0', () => {
    expect(seleccionarVisibles([1, 2, 3], 10, [])).toEqual([0, 1, 2]);
    expect(seleccionarVisibles([1, 2, 3], 0, [])).toEqual([]);
  });

  it('parsearHsl lee el triple de un token del tema', () => {
    expect(parsearHsl('210 100% 50%')).toEqual([210 / 360, 1, 0.5]);
    expect(parsearHsl(' 45, 100%, 50% ')).toEqual([45 / 360, 1, 0.5]);
    expect(parsearHsl('rojo')).toBeNull();
  });
});
