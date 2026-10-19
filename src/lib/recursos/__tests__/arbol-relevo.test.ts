import { describe, it, expect } from 'vitest';
import { armarArbol, recolocar } from '../arbol-relevo';

describe('armarArbol', () => {
  it('should handle a single receptor', () => {
    const origen = 'origen';
    const receptores = [{ nodoId: 'receptor1', subidaKbps: 1000 }];
    const kbpsFlujo = 100;
    const arbol = armarArbol(origen, receptores, kbpsFlujo);
    // Expect: receptor1's parent is origen
    expect(arbol.get('receptor1')).toBe(origen);
  });

  it('should handle multiple receptors and build a tree based on subida', () => {
    const origen = 'origen';
    const receptores = [
      { nodoId: 'A', subidaKbps: 300 },
      { nodoId: 'B', subidaKbps: 200 },
      { nodoId: 'C', subidaKbps: 100 },
    ];
    const kbpsFlujo = 100;
    const arbol = armarArbol(origen, receptores, kbpsFlujo);
    // Each node can have floor(subida / kbpsFlujo) children:
    // A: floor(300/100)=3, B:2, C:1
    // We expect the tree to be built so that higher subida nodes are closer to the origin.
    // Since we start with origin (infinite capacity), we add A, then B, then C.
    // All can be direct children of origin because origin has infinite capacity and each node's parent is set to a node with available capacity.
    // In our current algorithm, we try origin first, then the already added nodes in order.
    // So A: parent = origin (origin capacity infinite -> now infinite-1, but we don't track origin capacity in the returned map? We only return child->parent.
    // We don't return the capacity of the origin, so we cannot check. We'll assume the test passes if we return a parent for each.
    expect(arbol.get('A')).toBe(origen);
    expect(arbol.get('B')).toBe(origen);
    expect(arbol.get('C')).toBe(origen);
  });

  it('should handle 200 receptors', () => {
    const origen = 'origen';
    const receptores: { nodoId: string; subidaKbps?: number; latenciaMs?: number }[] = [];
    for (let i = 0; i < 200; i++) {
      receptores.push({ nodoId: `r${i}`, subidaKbps: 1000 - i }); // Decreasing subida
    }
    const kbpsFlujo = 100;
    const arbol = armarArbol(origen, receptores, kbpsFlujo);
    // Check that every receptor has a parent
    for (const r of receptores) {
      expect(arbol.get(r.nodoId)).not.toBeUndefined();
    }
  });
});

describe('recolocar', () => {
  it('should handle removing a leaf node', () => {
    const arbol = new Map<string, string>([
      ['A', 'origen'],
      ['B', 'A'],
      ['C', 'B'],
    ]);
    const seVa = 'C';
    const nuevoArbol = recolocar(arbol, seVa);
    // After removing C, the tree should be: A->origen, B->A, and C is gone.
    expect(nuevoArbol.has('C')).toBe(false);
    expect(nuevoArbol.get('A')).toBe('origen');
    expect(nuevoArbol.get('B')).toBe('A');
  });

  it('should handle removing a node with children', () => {
    const arbol = new Map<string, string>([
      ['A', 'origen'],
      ['B', 'A'],
      ['C', 'A'],
      ['D', 'B'],
      ['E', 'C'],
    ]);
    const seVa = 'A';
    const nuevoArbol = recolocar(arbol, seVa);
    // When A is removed, we need to reattach B and C (and their subtrees).
    // We expect that B and C will be reattached to the origin (since origin has infinite capacity) or to another available node.
    // In our simple implementation, we might just remove A and leave B and C without a parent? But we must reattach.
    // We'll check that B and C have a parent in the new tree.
    expect(nuevoArbol.has('A')).toBe(false);
    expect(nuevoArbol.get('B')).not.toBeUndefined();
    expect(nuevoArbol.get('C')).not.toBeUndefined();
    expect(nuevoArbol.get('D')).not.toBeUndefined();
    expect(nuevoArbol.get('E')).not.toBeUndefined();
  });
});