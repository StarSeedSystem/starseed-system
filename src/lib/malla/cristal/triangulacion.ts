export interface Punto {
  id: string;
  x: number;
  y: number;
}

/**
 * Proyección equirectangular local (metros) alrededor de (lat0, lon0).
 * La diferencia de longitud se lleva a [-180°, 180°) para que dos puntos a ambos
 * lados del antimeridiano (179,9° y -179,9°) queden a la distancia real y no a casi
 * una vuelta entera.
 */
export function proyectar(lat: number, lon: number, lat0: number, lon0: number): { x: number; y: number } {
  const R = 6371000;
  const dLat = (lat - lat0) * Math.PI / 180;
  const dLonGrados = ((((lon - lon0) % 360) + 540) % 360) - 180;
  const dLon = dLonGrados * Math.PI / 180;
  const x = R * dLon * Math.cos(lat0 * Math.PI / 180);
  const y = R * dLat;
  return { x, y };
}

/** Vértice simbólico «en el infinito» de los triángulos fantasma. */
const FANTASMA = -1;
/** Tolerancia de los predicados sobre coordenadas normalizadas a la caja [0, 1]. */
const EPS = 1e-12;

type Triangulo = [number, number, number];

/**
 * Triangulación de Delaunay de un conjunto de puntos: devuelve sus aristas
 * `[idMenor, idMayor]`, sin repetir y ordenadas.
 *
 * Bowyer–Watson con triángulos fantasma (Cheng, Dey y Shewchuk, «Delaunay Mesh
 * Generation», §3): en vez de un supertriángulo finito —que deja fuera aristas del
 * contorno convexo cuando uno de sus vértices cae dentro de la circunferencia de un
 * triángulo real— cada arista del contorno lleva un triángulo con un vértice en el
 * infinito cuyo «círculo» es el semiplano exterior más la arista abierta. Así el
 * contorno convexo sale siempre completo y no hay ids reservados.
 *
 * - Puntos con la misma posición cuentan una vez (se queda el id menor).
 * - Todos colineales: la cadena de vecinos consecutivos a lo largo de la recta.
 * - Puntos concíclicos: se resuelven de forma determinista por el orden de los ids,
 *   así que el orden de entrada no cambia la salida.
 */
export function delaunay(puntos: Punto[]): Array<[string, string]> {
  if (puntos.length < 2) return [];

  const puntosUnicos = new Map<string, Punto>();
  for (const p of puntos) {
    const key = `${p.x},${p.y}`;
    if (!puntosUnicos.has(key) || puntosUnicos.get(key)!.id > p.id) {
      puntosUnicos.set(key, p);
    }
  }
  const unicos = Array.from(puntosUnicos.values()).sort((a, b) => a.id.localeCompare(b.id));

  if (unicos.length === 1) return [];
  if (unicos.length === 2) {
    return [[unicos[0].id, unicos[1].id].sort() as [string, string]];
  }

  // Coordenadas normalizadas a la caja [0, 1]: las tolerancias valen igual en metros o en grados.
  const minX = Math.min(...unicos.map((p) => p.x));
  const minY = Math.min(...unicos.map((p) => p.y));
  const escala = Math.max(
    Math.max(...unicos.map((p) => p.x)) - minX,
    Math.max(...unicos.map((p) => p.y)) - minY,
  );
  const P = unicos.map((p) => ({ x: (p.x - minX) / escala, y: (p.y - minY) / escala }));

  const orientacion = (a: number, b: number, c: { x: number; y: number }): number =>
    (P[b].x - P[a].x) * (c.y - P[a].y) - (P[b].y - P[a].y) * (c.x - P[a].x);

  const aristaOrdenada = (a: number, b: number): [string, string] => {
    const ia = unicos[a].id;
    const ib = unicos[b].id;
    return ia < ib ? [ia, ib] : [ib, ia];
  };
  const ordenarAristas = (aristas: Array<[string, string]>) =>
    aristas.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

  // Triángulo inicial bien formado: a = primer id, b = el más lejano a a, c = el más alejado de la recta ab.
  const a = 0;
  let b = 1;
  for (let i = 2; i < P.length; i++) {
    const di = (P[i].x - P[a].x) ** 2 + (P[i].y - P[a].y) ** 2;
    const db = (P[b].x - P[a].x) ** 2 + (P[b].y - P[a].y) ** 2;
    if (di > db) b = i;
  }
  let c = -1;
  let mejor = EPS;
  for (let i = 0; i < P.length; i++) {
    if (i === a || i === b) continue;
    const o = Math.abs(orientacion(a, b, P[i]));
    if (o > mejor) {
      mejor = o;
      c = i;
    }
  }

  if (c === -1) {
    // Todos colineales: vecinos consecutivos a lo largo de la recta, no por orden de id.
    const dx = P[b].x - P[a].x;
    const dy = P[b].y - P[a].y;
    const t = (i: number) => (P[i].x - P[a].x) * dx + (P[i].y - P[a].y) * dy;
    const enRecta = P.map((_, i) => i).sort((i, j) => t(i) - t(j));
    const aristas: Array<[string, string]> = [];
    for (let k = 0; k < enRecta.length - 1; k++) aristas.push(aristaOrdenada(enRecta[k], enRecta[k + 1]));
    return ordenarAristas(aristas);
  }

  if (orientacion(a, b, P[c]) < 0) [b, c] = [c, b];
  // Todo triángulo va en sentido antihorario; el fantasma siempre en la última posición,
  // y en [u, v, FANTASMA] el exterior queda a la izquierda de u→v.
  let triangulos: Triangulo[] = [
    [a, b, c],
    [b, a, FANTASMA],
    [c, b, FANTASMA],
    [a, c, FANTASMA],
  ];

  const dentroDelCirculo = (t: Triangulo, p: { x: number; y: number }): boolean => {
    if (t[2] === FANTASMA) {
      const [u, v] = t;
      const o = orientacion(u, v, p);
      if (o > EPS) return true;
      if (o < -EPS) return false;
      // Colineal con la arista del contorno: dentro solo si cae en la arista abierta.
      const enU = (p.x - P[u].x) * (P[v].x - P[u].x) + (p.y - P[u].y) * (P[v].y - P[u].y);
      const enV = (p.x - P[v].x) * (P[u].x - P[v].x) + (p.y - P[v].y) * (P[u].y - P[v].y);
      return enU > 0 && enV > 0;
    }
    const [i, j, k] = t;
    const ax = P[i].x - p.x, ay = P[i].y - p.y;
    const bx = P[j].x - p.x, by = P[j].y - p.y;
    const cx = P[k].x - p.x, cy = P[k].y - p.y;
    const det =
      (ax * ax + ay * ay) * (bx * cy - cx * by) -
      (bx * bx + by * by) * (ax * cy - cx * ay) +
      (cx * cx + cy * cy) * (ax * by - bx * ay);
    return det > EPS;
  };

  for (let i = 0; i < P.length; i++) {
    if (i === a || i === b || i === c) continue;
    const malos = triangulos.filter((t) => dentroDelCirculo(t, P[i]));
    if (malos.length === 0) continue;

    // Borde de la cavidad: aristas dirigidas de los triángulos malos cuya inversa no es de otro malo.
    const dirigidas = new Set<string>();
    for (const t of malos) for (let k = 0; k < 3; k++) dirigidas.add(`${t[k]},${t[(k + 1) % 3]}`);
    const quedan = new Set(triangulos);
    for (const t of malos) quedan.delete(t);
    triangulos = Array.from(quedan);

    for (const t of malos) {
      for (let k = 0; k < 3; k++) {
        const u = t[k];
        const v = t[(k + 1) % 3];
        if (dirigidas.has(`${v},${u}`)) continue;
        if (v === FANTASMA) triangulos.push([i, u, FANTASMA]);
        else if (u === FANTASMA) triangulos.push([v, i, FANTASMA]);
        else triangulos.push([u, v, i]);
      }
    }
  }

  const vistas = new Set<string>();
  const result: Array<[string, string]> = [];
  for (const t of triangulos) {
    if (t[2] === FANTASMA) continue;
    for (let k = 0; k < 3; k++) {
      const e = aristaOrdenada(t[k], t[(k + 1) % 3]);
      const key = `${e[0]}|${e[1]}`;
      if (!vistas.has(key)) {
        vistas.add(key);
        result.push(e);
      }
    }
  }
  return ordenarAristas(result);
}
