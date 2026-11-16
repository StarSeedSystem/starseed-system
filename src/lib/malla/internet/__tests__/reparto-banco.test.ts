import { describe, it, expect } from 'vitest';
import { repartirRacion } from '../reparto-banco';

describe('repartirRacion', () => {
  describe('casos base', () => {
    it('ración cero → reparto vacío, sobranteMb = 0', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true },
        { id: 'b', capacidadKbps: 200, conectado: true },
      ];
      const r = repartirRacion(0, nodos);
      expect(r.reparto).toEqual([]);
      expect(r.sobranteMb).toBe(0);
    });

    it('sin nodos válidos → reparto vacío, sobranteMb = ración', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 0, conectado: true },
        { id: 'b', capacidadKbps: 100, conectado: false },
      ];
      const r = repartirRacion(10, nodos);
      expect(r.reparto).toEqual([]);
      expect(r.sobranteMb).toBe(10);
    });

    it('ración negativa → reparto vacío, sobranteMb = ración (normalizado a 0)', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true },
      ];
      const r = repartirRacion(-5, nodos);
      expect(r.reparto).toEqual([]);
      expect(r.sobranteMb).toBe(0);
    });
  });

  describe('reparto proporcional básico', () => {
    it('dos nodos 1:3 reciben ración 16 (1:3) = 4:12', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true },
        { id: 'b', capacidadKbps: 300, conectado: true },
      ];
      const r = repartirRacion(16, nodos);
      expect(r.reparto).toHaveLength(2);
      const mbA = r.reparto.find(x => x.id === 'a')?.mb;
      const mbB = r.reparto.find(x => x.id === 'b')?.mb;
      expect(mbA).toBe(4);
      expect(mbB).toBe(12);
      expect(r.sobranteMb).toBe(0);
    });
  });

  describe('límite máximo (maxMb)', () => {
    it('nodo con tope recibe menos y exceso se reparte', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true, maxMb: 2 },
        { id: 'b', capacidadKbps: 300, conectado: true },
      ];
      const r = repartirRacion(16, nodos);
      const mbA = r.reparto.find(x => x.id === 'a')?.mb;
      const mbB = r.reparto.find(x => x.id === 'b')?.mb;
      expect(mbA).toBe(2);
      expect(mbB).toBe(14);
      expect(r.sobranteMb).toBe(0);
    });

    it('todos al tope → sobranteMb = ración restante', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true, maxMb: 5 },
        { id: 'b', capacidadKbps: 100, conectado: true, maxMb: 5 },
      ];
      const r = repartirRacion(15, nodos);
      expect(r.reparto.find(x => x.id === 'a')?.mb).toBe(5);
      expect(r.reparto.find(x => x.id === 'b')?.mb).toBe(5);
      expect(r.sobranteMb).toBe(5);
    });
  });

  describe('nodo desconectado', () => {
    it('nodo conectado=false se ignora', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true },
        { id: 'b', capacidadKbps: 300, conectado: false },
        { id: 'c', capacidadKbps: 200, conectado: true },
      ];
      const r = repartirRacion(30, nodos);
      expect(r.reparto).toHaveLength(2);
      const mbA = r.reparto.find(x => x.id === 'a')?.mb;
      const mbc = r.reparto.find(x => x.id === 'c')?.mb;
      expect(mbA).toBe(6);
      expect(mbc).toBe(24);
      expect(r.sobranteMb).toBe(0);
    });
  });

  describe('suma exacta', () => {
    it('suma de reparto + sobranteMb = ración original', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 100, conectado: true, maxMb: 3 },
        { id: 'b', capacidadKbps: 100, conectado: true },
      ];
      const r = repartirRacion(10, nodos);
      const suma = r.reparto.reduce((s, x) => s + x.mb, 0) + r.sobranteMb;
      expect(suma).toBe(10);
    });
  });

  describe('determinismo con ids empatados', () => {
    it('mismo input → mismo output (mayor resto desempata por id)', () => {
      const nodos = [
        { id: 'aa', capacidadKbps: 100, conectado: true },
        { id: 'bb', capacidadKbps: 100, conectado: true },
      ];
      const r1 = repartirRacion(3, nodos);
      const r2 = repartirRacion(3, nodos);
      expect(r1).toEqual(r2);
    });
  });

  describe('redondeo mayor resto', () => {
    it('redondeo a 1 MB con método del mayor resto', () => {
      const nodos = [
        { id: 'a', capacidadKbps: 1, conectado: true },
        { id: 'b', capacidadKbps: 2, conectado: true },
      ];
      const r = repartirRacion(10, nodos);
      const suma = r.reparto.reduce((s, x) => s + x.mb, 0) + r.sobranteMb;
      expect(suma).toBe(10);
    });
  });
});