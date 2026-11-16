import { describe, it, expect } from 'vitest';
import { repartirRacion } from '../reparto-banco';

describe('repartirRacion', () => {
  describe('casos base', () => {
    it('sin nodos válidos → reparto vacío, sobrante = ración', () => {
      const r = repartirRacion(100, []);
      expect(r.reparto).toEqual([]);
      expect(r.sobranteMb).toBe(100);
    });

    it('ración ≤ 0 → reparto vacío, sobrante = ración (o 0)', () => {
      const r1 = repartirRacion(0, [{ id: 'a', capacidadKbps: 100, conectado: true }]);
      expect(r1.reparto).toEqual([]);
      expect(r1.sobranteMb).toBe(0);

      const r2 = repartirRacion(-10, [{ id: 'a', capacidadKbps: 100, conectado: true }]);
      expect(r2.reparto).toEqual([]);
      expect(r2.sobranteMb).toBe(-10);
    });

    it('nodos desconectados se ignoran', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: false },
        { id: 'b', capacidadKbps: 200, conectado: true },
      ];
      const r = repartirRacion(100, nodos);
      expect(r.reparto).toHaveLength(1);
      expect(r.reparto[0].id).toBe('b');
      expect(r.reparto[0].mb).toBe(100);
      expect(r.sobranteMb).toBe(0);
    });

    it('nodos con capacidadKbps ≤ 0 se ignoran', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 0, conectado: true },
        { id: 'b', capacidadKbps: -10, conectado: true },
        { id: 'c', capacidadKbps: 100, conectado: true },
      ];
      const r = repartirRacion(100, nodos);
      expect(r.reparto).toHaveLength(1);
      expect(r.reparto[0].id).toBe('c');
      expect(r.reparto[0].mb).toBe(100);
      expect(r.sobranteMb).toBe(0);
    });
  });

  describe('reparto proporcional básico', () => {
    it('dos nodos 1:3 → 25 MB y 75 MB de 100 MB', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true },
        { id: 'b', capacidadKbps: 300, conectado: true },
      ];
      const r = repartirRacion(100, nodos);
      expect(r.reparto).toEqual([
        { id: 'a', mb: 25 },
        { id: 'b', mb: 75 },
      ]);
      expect(r.sobranteMb).toBe(0);
    });

    it('tres nodos 1:2:3 → 16, 33, 51 de 100 (mayor resto)', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true },
        { id: 'b', capacidadKbps: 200, conectado: true },
        { id: 'c', capacidadKbps: 300, conectado: true },
      ];
      const r = repartirRacion(100, nodos);
      // 100/600 = 1/6 → 16.66, 33.33, 50
      // partes enteras: 16, 33, 50 = 99, resta 1 → al mayor resto (0.66 de 'a')
      expect(r.reparto.map(x => x.mb)).toEqual([17, 33, 50]);
      expect(r.sobranteMb).toBe(0);
    });

    it('suma exacta: reparto + sobrante = ración', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 123, conectado: true },
        { id: 'b', capacidadKbps: 456, conectado: true },
        { id: 'c', capacidadKbps: 789, conectado: true },
      ];
      const r = repartirRacion(1000, nodos);
      const suma = r.reparto.reduce((s, n) => s + n.mb, 0) + r.sobranteMb;
      expect(suma).toBe(1000);
    });
  });

  describe('límites maxMb', () => {
    it('un nodo con tope recibe su tope, el exceso va al otro', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true, maxMb: 20 },
        { id: 'b', capacidadKbps: 300, conectado: true },
      ];
      const r = repartirRacion(100, nodos);
      // a proporcional = 25, pero tope 20 → exceso 5 a b
      // b proporcional = 75 + 5 = 80
      expect(r.reparto).toEqual([
        { id: 'a', mb: 20 },
        { id: 'b', mb: 80 },
      ]);
      expect(r.sobranteMb).toBe(0);
    });

    it('todos al tope → sobrante = lo que no cupo', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true, maxMb: 10 },
        { id: 'b', capacidadKbps: 200, conectado: true, maxMb: 20 },
      ];
      const r = repartirRacion(100, nodos);
      expect(r.reparto).toEqual([
        { id: 'a', mb: 10 },
        { id: 'b', mb: 20 },
      ]);
      expect(r.sobranteMb).toBe(70);
    });

    it('exceso se reparte proporcionalmente entre los que no están al tope', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true, maxMb: 15 },
        { id: 'b', capacidadKbps: 200, conectado: true, maxMb: 50 },
        { id: 'c', capacidadKbps: 300, conectado: true },
      ];
      const r = repartirRacion(100, nodos);
      // proporcional: a=16.66, b=33.33, c=50
      // a tope 15 → exceso 1.66
      // b tope 50 (no llega) → recibe su parte + parte del exceso
      // c sin tope → recibe su parte + parte del exceso
      expect(r.reparto[0].mb).toBe(15);
      expect(r.reparto[1].mb + r.reparto[2].mb).toBe(85);
      expect(r.sobranteMb).toBe(0);
    });
  });

  describe('redondeo mayor resto con desempate por id', () => {
    it('empate en resto → gana id menor lexicográficamente', () => {
      // Dos nodos con misma capacidad, ración impar
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true },
        { id: 'b', capacidadKbps: 100, conectado: true },
      ];
      const r = repartirRacion(3, nodos);
      // cada uno 1.5 → partes enteras 1,1 = 2, resta 1 → al mayor resto (0.5 empate) → id 'a'
      expect(r.reparto).toEqual([
        { id: 'a', mb: 2 },
        { id: 'b', mb: 1 },
      ]);
      expect(r.sobranteMb).toBe(0);
    });

    it('tres nodos, el de mayor capacidad tiene mayor resto', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true },
        { id: 'b', capacidadKbps: 100, conectado: true },
        { id: 'c', capacidadKbps: 200, conectado: true },
      ];
      const r = repartirRacion(5, nodos);
      // a=1.25, b=1.25, c=2.5 → enteros 1,1,2 = 4, resta 1 → mayor resto es c (0.5)
      expect(r.reparto.map(x => x.mb)).toEqual([1, 1, 3]);
      expect(r.sobranteMb).toBe(0);
    });
  });

  describe('determinismo', () => {
    it('misma entrada → misma salida', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 123, conectado: true },
        { id: 'b', capacidadKbps: 456, conectado: true, maxMb: 200 },
        { id: 'c', capacidadKbps: 789, conectado: true },
        { id: 'd', capacidadKbps: 0, conectado: true },
        { id: 'e', capacidadKbps: 100, conectado: false },
      ];
      const r1 = repartirRacion(500, nodos);
      const r2 = repartirRacion(500, nodos);
      expect(r1).toEqual(r2);
    });

    it('orden de nodos en entrada no afecta salida (ordenado por id internamente)', () => {
      const nodos1 = [
        { id: 'c', capacidadKbps: 300, conectado: true },
        { id: 'a', capacidadKbps: 100, conectado: true },
        { id: 'b', capacidadKbps: 200, conectado: true },
      ];
      const nodos2 = [
        { id: 'a', capacidadKbps: 100, conectado: true },
        { id: 'b', capacidadKbps: 200, conectado: true },
        { id: 'c', capacidadKbps: 300, conectado: true },
      ];
      const r1 = repartirRacion(100, nodos1);
      const r2 = repartirRacion(100, nodos2);
      expect(r1.reparto).toEqual(r2.reparto);
      expect(r1.sobranteMb).toBe(r2.sobranteMb);
    });
  });

  describe('no muta la entrada', () => {
    it('el array original y los objetos no cambian', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true, maxMb: 50 },
        { id: 'b', capacidadKbps: 200, conectado: true },
      ];
      const nodosCopia = JSON.parse(JSON.stringify(nodos));
      repartirRacion(100, nodos);
      expect(nodos).toEqual(nodosCopia);
    });
  });
});