import { describe, it, expect } from 'vitest';
import { proyectar, delaunay } from '../triangulacion';
import type { Punto } from '../tipos'; // We don't see Punto in tipos.ts, so we might need to define it or import from elsewhere.

// Since we don't have the Punto type in tipos.ts, we can define it locally for the test, but note the test uses it.
// Alternatively, we can check if there is a Punto type in the cristal module. Let's look again at tipos.ts: we don't see it.
// We'll define it in the test file for now, but note that the implementation might expect a different type.
// However, the test cases use { id: string, x: number, y: number }.

describe('triangulación de la malla cristalina', () => {
  describe('proyectar', () => {
    it('proyectar 0,0 a 0,0 y 1 grado de latitud aproximadamente 111 km', () => {
      const p0 = proyectar(0, 0, 0, 0);
      expect(p0.x).toBe(0);
      expect(p0.y).toBe(0);

      const p1 = proyectar(1, 0, 0, 0);
      expect(p1.x).toBe(0);
      expect(Math.round(p1.y / 1000)).toBe(111);
    });
  });

  describe('delaunay', () => {
    it('delaunay con menos de 2 puntos devuelve vacío', () => {
      expect(delaunay([])).toEqual([]);
      expect(delaunay([{ id: 'a', x: 0, y: 0 }])).toEqual([]);
    });

    it('delaunay con 2 puntos devuelve una arista', () => {
      const puntos: { id: string; x: number; y: number }[] = [
        { id: 'b', x: 1, y: 0 },
        { id: 'a', x: 0, y: 0 },
      ];
      const aristas = delaunay(puntos);
      expect(aristas).toEqual([['a', 'b']]);
    });

    it('delaunay con triángulo da 3 aristas', () => {
      const puntos: { id: string; x: number; y: number }[] = [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 1, y: 0 },
        { id: 'c', x: 0.5, y: 1 },
      ];
      const aristas = delaunay(puntos);
      expect(aristas.length).toBe(3);
      expect(aristas).toEqual([
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'c'],
      ]);
    });

    it('cuadrado de 4 puntos da 5 aristas', () => {
      const puntos: { id: string; x: number; y: number }[] = [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 1, y: 0 },
        { id: 'c', x: 1, y: 1 },
        { id: 'd', x: 0, y: 1 },
      ];
      const aristas = delaunay(puntos);
      expect(aristas.length).toBe(5);
    });

    it('puntos colineales devuelve la cadena en orden', () => {
      const puntos: { id: string; x: number; y: number }[] = [
        { id: 'c', x: 2, y: 0 },
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 1, y: 0 },
      ];
      const aristas = delaunay(puntos);
      expect(aristas).toEqual([
        ['a', 'b'],
        ['b', 'c'],
      ]);
    });

    it('orden de entrada no cambia la salida', () => {
      const p1: { id: string; x: number; y: number }[] = [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 1, y: 0 },
        { id: 'c', x: 0.5, y: 1 },
      ];
      const p2: { id: string; x: number; y: number }[] = [
        { id: 'c', x: 0.5, y: 1 },
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 1, y: 0 },
      ];
      expect(delaunay(p1)).toEqual(delaunay(p2));
    });
  });
});