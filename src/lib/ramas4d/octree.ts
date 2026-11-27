/**
 * octree — árbol octal y aproximación de Barnes-Hut para la física de Ramas 4D (MV1125C).
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO (sin DOM, red ni `node:*`): se usa igual en el hilo principal y en el
 * Web Worker. La distancia es afinidad; aquí solo se calculan fuerzas, no se decide nada.
 * Determinista: la misma entrada da exactamente el mismo árbol y las mismas fuerzas.
 */

export const PROFUNDIDAD_MAX_OCTREE = 20;

export interface Caja3D {
  cx: number;
  cy: number;
  cz: number;
  mitad: number;
}

export interface NodoOctree {
  cx: number;
  cy: number;
  cz: number;
  mitad: number;
  masa: number;
  comX: number;
  comY: number;
  comZ: number;
  hijos: (NodoOctree | null)[] | null;
  indices: number[] | null;
  profundidad: number;
}

export interface ParametrosFuerzaBarnesHut {
  /** Criterio de lejanía: menor = más exacto y más lento. */
  theta?: number;
  /** Gravitatorio positivo (atrae); negativo (repele). */
  G?: number;
  /** Suavizado para no dividir por cero. */
  suavizado?: number;
}

/** Octante (0..7) de un punto respecto al centro de una caja: bit 0 = x, bit 1 = y, bit 2 = z. */
export function indiceOctante(
  cx: number,
  cy: number,
  cz: number,
  px: number,
  py: number,
  pz: number,
): number {
  return (px >= cx ? 1 : 0) | (py >= cy ? 2 : 0) | (pz >= cz ? 4 : 0);
}

function crearNodo(
  cx: number,
  cy: number,
  cz: number,
  mitad: number,
  profundidad: number,
): NodoOctree {
  return {
    cx,
    cy,
    cz,
    mitad,
    masa: 0,
    comX: cx,
    comY: cy,
    comZ: cz,
    hijos: null,
    indices: null,
    profundidad,
  };
}

function construirNodo(
  posiciones: Float32Array,
  masas: Float32Array,
  indices: number[],
  cx: number,
  cy: number,
  cz: number,
  mitad: number,
  profundidad: number,
): NodoOctree {
  const nodo = crearNodo(cx, cy, cz, mitad, profundidad);
  let masa = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    const m = masas[i];
    masa += m;
    sx += posiciones[i * 3] * m;
    sy += posiciones[i * 3 + 1] * m;
    sz += posiciones[i * 3 + 2] * m;
  }
  nodo.masa = masa;
  if (masa > 0) {
    nodo.comX = sx / masa;
    nodo.comY = sy / masa;
    nodo.comZ = sz / masa;
  }
  if (indices.length <= 1 || profundidad >= PROFUNDIDAD_MAX_OCTREE || mitad < 1e-9) {
    nodo.indices = indices;
    return nodo;
  }
  const cubos: number[][] = [[], [], [], [], [], [], [], []];
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    const octante = indiceOctante(
      cx,
      cy,
      cz,
      posiciones[i * 3],
      posiciones[i * 3 + 1],
      posiciones[i * 3 + 2],
    );
    cubos[octante].push(i);
  }
  const h = mitad / 2;
  const hijos: (NodoOctree | null)[] = [null, null, null, null, null, null, null, null];
  let algunHijo = false;
  for (let o = 0; o < 8; o++) {
    if (cubos[o].length === 0) continue;
    const ox = (o & 1) !== 0 ? h : -h;
    const oy = (o & 2) !== 0 ? h : -h;
    const oz = (o & 4) !== 0 ? h : -h;
    hijos[o] = construirNodo(
      posiciones,
      masas,
      cubos[o],
      cx + ox,
      cy + oy,
      cz + oz,
      h,
      profundidad + 1,
    );
    algunHijo = true;
  }
  if (!algunHijo) {
    nodo.indices = indices;
    return nodo;
  }
  nodo.hijos = hijos;
  return nodo;
}

/** Construye el octree de un conjunto de posiciones (x,y,z intercalados). */
export function construirOctree(
  posiciones: Float32Array,
  masas?: Float32Array,
): NodoOctree | null {
  const n = Math.floor(posiciones.length / 3);
  if (n === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = posiciones[i * 3];
    const y = posiciones[i * 3 + 1];
    const z = posiciones[i * 3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const mitad = Math.max((maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2, 1e-6);
  const pesos = masas ?? new Float32Array(n).fill(1);
  const indices = new Array<number>(n);
  for (let i = 0; i < n; i++) indices[i] = i;
  return construirNodo(posiciones, pesos, indices, cx, cy, cz, mitad, 0);
}

/** Número total de nodos del árbol (útil para pruebas y diagnóstico). */
export function contarNodosOctree(arbol: NodoOctree | null): number {
  if (!arbol) return 0;
  if (!arbol.hijos) return 1;
  let total = 1;
  for (const hijo of arbol.hijos) total += contarNodosOctree(hijo);
  return total;
}

function acumularFuerza(
  arbol: NodoOctree,
  posiciones: Float32Array,
  masas: Float32Array,
  indice: number,
  theta: number,
  G: number,
  epsilon2: number,
  pila: NodoOctree[],
  salida: Float32Array,
): void {
  const px = posiciones[indice * 3];
  const py = posiciones[indice * 3 + 1];
  const pz = posiciones[indice * 3 + 2];
  let fx = 0;
  let fy = 0;
  let fz = 0;
  pila.length = 0;
  pila.push(arbol);
  while (pila.length > 0) {
    const nodo = pila.pop() as NodoOctree;
    const dx = nodo.comX - px;
    const dy = nodo.comY - py;
    const dz = nodo.comZ - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (!nodo.hijos) {
      const indices = nodo.indices;
      if (indices) {
        for (let k = 0; k < indices.length; k++) {
          const j = indices[k];
          if (j === indice) continue;
          const ex = posiciones[j * 3] - px;
          const ey = posiciones[j * 3 + 1] - py;
          const ez = posiciones[j * 3 + 2] - pz;
          const e2 = ex * ex + ey * ey + ez * ez + epsilon2;
          const inv = 1 / Math.sqrt(e2);
          const factor = G * masas[j] * inv * inv * inv;
          fx += factor * ex;
          fy += factor * ey;
          fz += factor * ez;
        }
      }
      continue;
    }
    const distancia = Math.sqrt(d2);
    const lado = nodo.mitad * 2;
    if (distancia > 1e-9 && lado / distancia < theta) {
      const e2 = d2 + epsilon2;
      const inv = 1 / Math.sqrt(e2);
      const factor = G * nodo.masa * inv * inv * inv;
      fx += factor * dx;
      fy += factor * dy;
      fz += factor * dz;
    } else {
      for (const hijo of nodo.hijos) {
        if (hijo) pila.push(hijo);
      }
    }
  }
  salida[indice * 3] = fx;
  salida[indice * 3 + 1] = fy;
  salida[indice * 3 + 2] = fz;
}

/**
 * Fuerza por unidad de masa sobre cada punto, con Barnes-Hut.
 * `G` positivo atrae; negativo repele. Devuelve x,y,z intercalados.
 */
export function fuerzasBarnesHut(
  posiciones: Float32Array,
  masas?: Float32Array,
  parametros?: ParametrosFuerzaBarnesHut,
): Float32Array {
  const n = Math.floor(posiciones.length / 3);
  const salida = new Float32Array(n * 3);
  if (n === 0) return salida;
  const pesos = masas ?? new Float32Array(n).fill(1);
  const arbol = construirOctree(posiciones, pesos);
  if (!arbol) return salida;
  const theta = parametros?.theta ?? 0.7;
  const G = parametros?.G ?? 1;
  const suavizado = parametros?.suavizado ?? 0.5;
  const epsilon2 = suavizado * suavizado;
  const pila: NodoOctree[] = [];
  for (let i = 0; i < n; i++) {
    acumularFuerza(arbol, posiciones, pesos, i, theta, G, epsilon2, pila, salida);
  }
  return salida;
}

/** Fuerza por unidad de masa sobre un solo punto (para depuración y pruebas). */
export function fuerzaSobre(
  arbol: NodoOctree,
  posiciones: Float32Array,
  indice: number,
  masas?: Float32Array,
  parametros?: ParametrosFuerzaBarnesHut,
): { x: number; y: number; z: number } {
  const n = Math.floor(posiciones.length / 3);
  const pesos = masas ?? new Float32Array(n).fill(1);
  const theta = parametros?.theta ?? 0.7;
  const G = parametros?.G ?? 1;
  const suavizado = parametros?.suavizado ?? 0.5;
  const salida = new Float32Array(3);
  acumularFuerza(arbol, posiciones, pesos, indice, theta, G, suavizado * suavizado, [], salida);
  return { x: salida[0], y: salida[1], z: salida[2] };
}
