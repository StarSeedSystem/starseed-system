/**
 * Octree para aproximación de Barnes-Hut (fuerza de cuerpo completo en O(n log n)).
 * Módulo puro: sin disco, sin red, determinista.
 */

export interface NodoOctree {
  centro: [number, number, number];
  tamano: number;
  masa: number;
  centroMasa: [number, number, number];
  hijos: NodoOctree[] | null;
  punto: [number, number, number] | null;
  indice: number | null;
}

export function crearNodo(
  centro: [number, number, number],
  tamano: number,
): NodoOctree {
  return {
    centro,
    tamano,
    masa: 0,
    centroMasa: [0, 0, 0],
    hijos: null,
    punto: null,
    indice: null,
  };
}

function octanteDe(centro: [number, number, number], punto: [number, number, number]): number {
  let oct = 0;
  if (punto[0] >= centro[0]) oct |= 1;
  if (punto[1] >= centro[1]) oct |= 2;
  if (punto[2] >= centro[2]) oct |= 4;
  return oct;
}

export function insertar(
  nodo: NodoOctree,
  punto: [number, number, number],
  masa: number,
  indice: number,
): void {
  if (nodo.masa === 0 && nodo.hijos === null && nodo.punto === null) {
    nodo.punto = punto;
    nodo.masa = masa;
    nodo.centroMasa = [punto[0], punto[1], punto[2]];
    nodo.indice = indice;
    return;
  }

  const masaTotal = nodo.masa + masa;
  nodo.centroMasa = [
    (nodo.centroMasa[0] * nodo.masa + punto[0] * masa) / masaTotal,
    (nodo.centroMasa[1] * nodo.masa + punto[1] * masa) / masaTotal,
    (nodo.centroMasa[2] * nodo.masa + punto[2] * masa) / masaTotal,
  ];
  nodo.masa = masaTotal;

  if (nodo.hijos === null) {
    nodo.hijos = [];
    const mitad = nodo.tamano / 2;
    const cuarto = mitad / 2;
    for (let i = 0; i < 8; i++) {
      const cx = nodo.centro[0] + (i & 1 ? cuarto : -cuarto);
      const cy = nodo.centro[1] + (i & 2 ? cuarto : -cuarto);
      const cz = nodo.centro[2] + (i & 4 ? cuarto : -cuarto);
      nodo.hijos.push(crearNodo([cx, cy, cz], mitad));
    }
    if (nodo.punto !== null) {
      const octViejo = octanteDe(nodo.centro, nodo.punto);
      const puntoViejo = nodo.punto;
      const masaVieja = nodo.masa - masa;
      nodo.punto = null;
      insertar(nodo.hijos[octViejo], puntoViejo, masaVieja, nodo.indice as number);
    }
  }

  const oct = octanteDe(nodo.centro, punto);
  insertar(nodo.hijos[oct], punto, masa, indice);
}

/** Crea el árbol a partir de un Float32Array plano de posiciones (x,y,z)*n. */
export function crearArbol(posiciones: Float32Array, n: number): NodoOctree {
  // Bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = posiciones[i * 3], y = posiciones[i * 3 + 1], z = posiciones[i * 3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const centro: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  const tamano = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6) * 1.01;
  const raiz = crearNodo(centro, tamano);
  for (let i = 0; i < n; i++) {
    insertar(raiz, [posiciones[i * 3], posiciones[i * 3 + 1], posiciones[i * 3 + 2]], 1, i);
  }
  return raiz;
}
