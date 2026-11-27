import { describe, expect, it } from 'vitest';
import {
  construirOctree,
  contarNodosOctree,
  fuerzaSobre,
  fuerzasBarnesHut,
  indiceOctante,
} from '../octree';

describe('octree', () => {
  it('asigna el octante correcto a cada esquina', () => {
    expect(indiceOctante(0, 0, 0, 1, 1, 1)).toBe(7);
    expect(indiceOctante(0, 0, 0, -1, -1, -1)).toBe(0);
    expect(indiceOctante(0, 0, 0, 1, -1, 1)).toBe(5);
    expect(indiceOctante(0, 0, 0, -1, 1, -1)).toBe(2);
  });

  it('devuelve null sin nodos', () => {
    expect(construirOctree(new Float32Array(0))).toBeNull();
  });

  it('suma la masa y calcula el centro de masas', () => {
    const posiciones = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 2, 0]);
    const arbol = construirOctree(posiciones);
    expect(arbol).not.toBeNull();
    if (!arbol) return;
    expect(arbol.masa).toBe(3);
    expect(arbol.comX).toBeCloseTo(0, 5);
    expect(arbol.comY).toBeCloseTo(2 / 3, 5);
    expect(contarNodosOctree(arbol)).toBeGreaterThan(1);
  });

  it('la fuerza atrae con G positivo y repele con G negativo', () => {
    const posiciones = new Float32Array([0, 0, 0, 2, 0, 0]);
    const masas = new Float32Array([1, 1]);
    const atraccion = fuerzasBarnesHut(posiciones, masas, { G: 1, suavizado: 0.1 });
    expect(atraccion[0]).toBeGreaterThan(0);
    expect(atraccion[3]).toBeLessThan(0);
    const repulsion = fuerzasBarnesHut(posiciones, masas, { G: -1, suavizado: 0.1 });
    expect(repulsion[0]).toBeLessThan(0);
    expect(repulsion[3]).toBeGreaterThan(0);
  });

  it('fuerzaSobre coincide con el cálculo por lotes', () => {
    const posiciones = new Float32Array([0, 0, 0, 3, 0, 0, 0, 4, 0]);
    const masas = new Float32Array([1, 2, 1]);
    const arbol = construirOctree(posiciones, masas);
    expect(arbol).not.toBeNull();
    if (!arbol) return;
    const lote = fuerzasBarnesHut(posiciones, masas, { G: 1, suavizado: 0.1 });
    const una = fuerzaSobre(arbol, posiciones, 0, masas, { G: 1, suavizado: 0.1 });
    expect(una.x).toBeCloseTo(lote[0], 5);
    expect(una.y).toBeCloseTo(lote[1], 5);
    expect(una.z).toBeCloseTo(lote[2], 5);
  });

  it('es determinista con la misma entrada', () => {
    const posiciones = new Float32Array([
      -1, 2, 0.5, 3, -1, 2, 0.2, 0.3, -0.4, 2, 2, 2, -2, -2, -2,
    ]);
    const a = fuerzasBarnesHut(posiciones);
    const b = fuerzasBarnesHut(posiciones);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
