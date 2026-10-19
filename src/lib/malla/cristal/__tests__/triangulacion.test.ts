import { describe, it, expect } from 'vitest';
import { proyectar, delaunay, Punto } from '../triangulacion';

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
      expect(delaunay([{ id: 'a', x: 0, y: 0 } as Punto])).toEqual([]);
    });

    it('delaunay con 2 puntos devuelve una arista', () => {
      const puntos: Punto[] = [
        { id: 'b', x: 1, y: 0 },
        { id: 'a', x: 0, y: 0 },
      ];
      const aristas = delaunay(puntos);
      expect(aristas).toEqual([['a', 'b']]);
    });

    it('delaunay con triángulo da 3 aristas', () => {
      const puntos: Punto[] = [
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
      const puntos: Punto[] = [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 1, y: 0 },
        { id: 'c', x: 1, y: 1 },
        { id: 'd', x: 0, y: 1 },
      ];
      const aristas = delaunay(puntos);
      expect(aristas.length).toBe(5);
    });

    it('puntos colineales devuelve la cadena en orden', () => {
      const puntos: Punto[] = [
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
      const p1: Punto[] = [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 1, y: 0 },
        { id: 'c', x: 0.5, y: 1 },
      ];
      const p2: Punto[] = [
        { id: 'c', x: 0.5, y: 1 },
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 1, y: 0 },
      ];
      expect(delaunay(p1)).toEqual(delaunay(p2));
    });
  });

  describe('duplicados', () => {
    it('elimina puntos duplicados, mantiene el id menor', () => {
      const puntos: Punto[] = [
        { id: 'b', x: 0, y: 0 },
        { id: 'a', x: 0, y: 0 },
        { id: 'c', x: 1, y: 0 },
      ];
      const aristas = delaunay(puntos);
      // Puntos únicos: a(0,0) y c(1,0)
      expect(aristas).toEqual([["a", "c"]]);
    });
  });

  describe('pentágono', () => {
    it('pentagono convexo da 7 aristas', () => {
      const puntos: Punto[] = [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 1, y: 0 },
        { id: 'c', x: 2, y: 1 },
        { id: 'd', x: 1, y: 2 },
        { id: 'e', x: 0, y: 1 },
      ];
      const aristas = delaunay(puntos);
      expect(aristas.length).toBe(7);
    });
  });
});