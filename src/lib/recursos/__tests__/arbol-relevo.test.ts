import { describe, it, expect } from 'vitest';
import { armarArbol, recolocar } from '../arbol-relevo';

describe('armarArbol', () => {
  it('debe armar árbol con 1 receptor', () => {
    const resultado = armarArbol('origen', [{ nodoId: 'r1', subidaKbps: 10 }], 5);
    expect(resultado).toBeDefined();
    expect(resultado.raiz.nodoId).toBe('origen');
    expect(resultado.padreDe['r1']).toBe('origen');
  });

  it('debe armar árbol con 10 receptores', () => {
    const receptores = [];
    for (let i = 1; i <= 10; i++) {
      receptores.push({ nodoId: `r${i}`, subidaKbps: 10 + i });
    }
    const resultado = armarArbol('origen', receptores, 5);
    expect(resultado).toBeDefined();
    expect(Object.keys(resultado.padreDe)).toHaveLength(10);
    // Los de más subida deben estar más cerca del origen
  });

  it('debe armar árbol con 200 receptores', () => {
    const receptores = [];
    for (let i = 1; i <= 200; i++) {
      receptores.push({ nodoId: `r${i}`, subidaKbps: i % 50 });
    }
    const resultado = armarArbol('origen', receptores, 2);
    expect(resultado).toBeDefined();
    expect(Object.keys(resultado.padreDe)).toHaveLength(200);
  });

  it('debe limitar hijos según capacidad', () => {
    // Cada nodo con subida 10 y kbpsFlujo 5 puede tener floor(10/5)=2 hijos
    const receptores = [
      { nodoId: 'r1', subidaKbps: 10 },
      { nodoId: 'r2', subidaKbps: 10 },
      { nodoId: 'r3', subidaKbps: 10 },
    ];
    const resultado = armarArbol('origen', receptores, 5);
    expect(resultado.raiz.hijos.length).toBeLessThanOrEqual(2);
  });

  it('debe recolocar rama al irse un nodo', () => {
    const receptores = [
      { nodoId: 'r1', subidaKbps: 10 },
      { nodoId: 'r2', subidaKbps: 10 },
    ];
    const arbol = armarArbol('origen', receptores, 5);
    const recolocado = recolocar(arbol, 'r1');
    expect(recolocado).toBeDefined();
  });

  it('sin medida de subida debe asumir 1', () => {
    const resultado = armarArbol('origen', [{ nodoId: 'r1' }], 5);
    expect(resultado.padreDe['r1']).toBe('origen');
  });
});
