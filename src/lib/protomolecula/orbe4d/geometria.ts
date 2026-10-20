/**
 * Orbe 4D de la Protomolécula · GEOMETRÍA SAGRADA (lógica PURA: sin three.js, sin React, sin `node:*`).
 *
 * Petición de Alex (2026-10-20): la orbe se transforma morfológicamente con geometría sagrada animada,
 * como el jitterbug y el teseracto que envió, pero más fluida. Aquí viven las formas como DATOS (vértices,
 * aristas y caras en el espacio de radio 1) para que el motor las dibuje y las pruebas las midan:
 *
 *   · jitterbug de Fuller: equilibrio vectorial (cuboctaedro) → icosaedro → octaedro → su espejo, con los
 *     8 triángulos rígidos que giran (la misma longitud de arista en todo el recorrido);
 *   · teseracto: el hipercubo de 16 vértices y 32 aristas, girado de verdad en 4D y proyectado a 3D;
 *   · merkaba (tetraedro estrella), los sólidos platónicos, la matriz isotrópica de vectores (la base de la
 *     rejilla de 64 tetraedros), la esfera de Fibonacci, la semilla y la flor de la vida y el cubo de Metatrón.
 *
 * Numerología y proporción: φ (1,618…) reparte radios y ritmos; 12 (vértices del equilibrio vectorial),
 * 144 (= 12², Fibonacci) partículas y los tiempos de Fibonacci viven en `coreografia.ts`.
 */

export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type Arista = [number, number];
export type Cara = [number, number, number];

export interface FormaGeometrica {
  vertices: Vec3[];
  aristas: Arista[];
  caras: Cara[];
}

export const PHI = (1 + Math.sqrt(5)) / 2;
export const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));

// ── utilidades ───────────────────────────────────────────────────────────────
export const resta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const longitud = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
export const distancia = (a: Vec3, b: Vec3): number => longitud(resta(a, b));
const cruz = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Escala los vértices para que el más lejano quede a `radio` del origen (el centro sagrado queda en 0). */
export function normalizar(vertices: Vec3[], radio = 1): Vec3[] {
  const max = vertices.reduce((m, v) => Math.max(m, longitud(v)), 0) || 1;
  const k = radio / max;
  return vertices.map((v) => [v[0] * k, v[1] * k, v[2] * k]);
}

/** Aristas entre vértices a la distancia `l` (±`tolerancia` relativa). */
export function aristasPorDistancia(vertices: Vec3[], l: number, tolerancia = 0.02): Arista[] {
  const salida: Arista[] = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      if (Math.abs(distancia(vertices[i], vertices[j]) - l) <= l * tolerancia) salida.push([i, j]);
    }
  }
  return salida;
}

/** La menor distancia entre dos vértices distintos (la arista de un sólido regular). */
export function aristaMinima(vertices: Vec3[]): number {
  let min = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const d = distancia(vertices[i], vertices[j]);
      if (d > 1e-6 && d < min) min = d;
    }
  }
  return min;
}

/**
 * Caras de la envolvente convexa (para sólidos convexos de pocos vértices): cada plano que deja todos
 * los demás puntos a un lado es una cara; sus vértices se ordenan alrededor de su centro y se abanican
 * en triángulos con la normal hacia fuera. O(n⁴) a propósito: n ≤ 20 y se calcula una sola vez.
 */
export function carasConvexas(vertices: Vec3[], eps = 1e-6): Cara[] {
  const n = vertices.length;
  const vistos = new Set<string>();
  const caras: Cara[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const nrm = cruz(resta(vertices[j], vertices[i]), resta(vertices[k], vertices[i]));
        const ln = longitud(nrm);
        if (ln < eps) continue;
        const u: Vec3 = [nrm[0] / ln, nrm[1] / ln, nrm[2] / ln];
        const d = punto(u, vertices[i]);
        let mas = 0, menos = 0;
        const enPlano: number[] = [];
        for (let m = 0; m < n; m++) {
          const s = punto(u, vertices[m]) - d;
          if (Math.abs(s) <= 1e-5) enPlano.push(m);
          else if (s > 0) mas++;
          else menos++;
        }
        if (mas > 0 && menos > 0) continue;
        const clave = enPlano.join(",");
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        const fuera: Vec3 = mas > 0 ? [-u[0], -u[1], -u[2]] : u;
        const c = enPlano.reduce<Vec3>((acc, m) => [acc[0] + vertices[m][0] / enPlano.length, acc[1] + vertices[m][1] / enPlano.length, acc[2] + vertices[m][2] / enPlano.length], [0, 0, 0]);
        const e1 = resta(vertices[enPlano[0]], c);
        const e2 = cruz(fuera, e1);
        const orden = [...enPlano].sort((a, b) => {
          const pa = resta(vertices[a], c), pb = resta(vertices[b], c);
          return Math.atan2(punto(pa, e2), punto(pa, e1)) - Math.atan2(punto(pb, e2), punto(pb, e1));
        });
        for (let t = 1; t + 1 < orden.length; t++) caras.push([orden[0], orden[t], orden[t + 1]]);
      }
    }
  }
  return caras;
}

/** Da la vuelta a las caras cuya normal mira hacia el centro (las que pasan por él se quedan como están). */
export function orientarHaciaFuera(vertices: Vec3[], caras: Cara[]): Cara[] {
  return caras.map(([a, b, c]) => {
    const n = cruz(resta(vertices[b], vertices[a]), resta(vertices[c], vertices[a]));
    const centro: Vec3 = [(vertices[a][0] + vertices[b][0] + vertices[c][0]) / 3, (vertices[a][1] + vertices[b][1] + vertices[c][1]) / 3, (vertices[a][2] + vertices[b][2] + vertices[c][2]) / 3];
    return punto(n, centro) < 0 ? [a, c, b] : [a, b, c];
  });
}

function solidoRegular(vertices: Vec3[]): FormaGeometrica {
  const v = normalizar(vertices);
  return { vertices: v, aristas: aristasPorDistancia(v, aristaMinima(v)), caras: carasConvexas(v) };
}

// ── sólidos platónicos ───────────────────────────────────────────────────────
export function tetraedro(): FormaGeometrica {
  return solidoRegular([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]);
}
export function octaedro(): FormaGeometrica {
  return solidoRegular([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);
}
export function cubo(): FormaGeometrica {
  const v: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
  return solidoRegular(v);
}
export function icosaedro(): FormaGeometrica {
  const v: Vec3[] = [];
  for (const a of [-1, 1]) for (const b of [-PHI, PHI]) v.push([0, a, b], [a, b, 0], [b, 0, a]);
  return solidoRegular(v);
}
export function dodecaedro(): FormaGeometrica {
  const v: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
  const i = 1 / PHI;
  for (const a of [-i, i]) for (const b of [-PHI, PHI]) v.push([0, a, b], [a, b, 0], [b, 0, a]);
  return solidoRegular(v);
}

// ── merkaba: tetraedro estrella (dos tetraedros que giran en sentidos opuestos) ─────────────────────
/** `giro` en radianes: el tetraedro solar gira +giro y el lunar −giro alrededor del eje vertical. */
export function merkaba(giro = 0): FormaGeometrica {
  const base: Vec3[] = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  const rot = (v: Vec3, a: number): Vec3 => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
  const solar = base.map((v) => rot(v, giro));
  const lunar = base.map((v) => rot([-v[0], -v[1], -v[2]], -giro));
  const vertices = normalizar([...solar, ...lunar]);
  const aristas: Arista[] = [];
  const caras: Cara[] = [];
  for (const o of [0, 4]) {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) aristas.push([o + a, o + b]);
    caras.push([o, o + 1, o + 2], [o, o + 3, o + 1], [o, o + 2, o + 3], [o + 1, o + 3, o + 2]);
  }
  return { vertices, aristas, caras: orientarHaciaFuera(vertices, caras) };
}

// ── jitterbug de Buckminster Fuller ──────────────────────────────────────────
/**
 * El equilibrio vectorial que se «contrae» girando sus 8 triángulos rígidos. `r` ∈ [−1, 1]:
 * 1 = cuboctaedro, 1/φ = icosaedro, 0 = octaedro (los 12 vértices se juntan de dos en dos); si el giro
 * sigue, los triángulos se cruzan por dentro: −1/φ da la estrella del gran icosaedro y −1 los cuatro
 * planos hexagonales (los «ecuadores» del equilibrio vectorial), con los triángulos pasando por el centro. Vértices (0, ±a, ±b) y sus permutaciones cíclicas con a = r·b y b
 * ajustado para que la arista de los triángulos valga siempre `L`.
 */
export function jitterbug(r: number, L = 1): FormaGeometrica {
  const k = Math.max(-1, Math.min(1, r));
  const b = L / Math.sqrt(1 + k * k + (k - 1) * (k - 1));
  const a = k * b;
  // Los 12 vértices en orden fijo (3 patrones cíclicos × 4 signos): los índices no cambian con `r`, así
  // las caras y las aristas siguen al mismo vértice durante toda la transformación.
  const signos: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const vertices: Vec3[] = [
    ...signos.map(([s1, s2]): Vec3 => [0, s1 * a, s2 * b]),
    ...signos.map(([s1, s2]): Vec3 => [s2 * b, 0, s1 * a]),
    ...signos.map(([s1, s2]): Vec3 => [s1 * a, s2 * b, 0]),
  ];
  const s = (s1: number, s2: number): number => (s1 > 0 ? 0 : 2) + (s2 > 0 ? 0 : 1);
  // Un triángulo rígido por octante (sx, sy, sz): (0, sy·a, sz·b), (sx·b, 0, sz·a), (sx·a, sy·b, 0).
  const caras: Cara[] = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const t: Cara = [s(sy, sz), 4 + s(sz, sx), 8 + s(sx, sy)];
    caras.push(t);
  }
  const aristas: Arista[] = [];
  const clave = new Set<string>();
  for (const [x, y, z] of caras) {
    for (const [p, q] of [[x, y], [y, z], [z, x]] as Arista[]) {
      const c = p < q ? `${p}-${q}` : `${q}-${p}`;
      if (!clave.has(c)) { clave.add(c); aristas.push(p < q ? [p, q] : [q, p]); }
    }
  }
  return { vertices, aristas, caras: orientarHaciaFuera(vertices, caras) };
}

/**
 * Aristas que el jitterbug gana al pasar por el icosaedro (las diagonales de los cuadrados que se vuelven
 * triángulos equiláteros): pares a distancia ≈ L que no son de un triángulo rígido, con un peso 0..1
 * que vale 1 justo en la distancia exacta y se apaga fuera de la tolerancia (para fundirlas suavemente).
 */
export function aristasEmergentes(forma: FormaGeometrica, L = 1, tolerancia = 0.12): { arista: Arista; peso: number }[] {
  const rigidas = new Set(forma.aristas.map(([p, q]) => `${p}-${q}`));
  const salida: { arista: Arista; peso: number }[] = [];
  const v = forma.vertices;
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      if (rigidas.has(`${i}-${j}`)) continue;
      const d = distancia(v[i], v[j]);
      if (d < 1e-6) continue;
      const desvio = Math.abs(d - L) / L;
      if (desvio <= tolerancia) salida.push({ arista: [i, j], peso: 1 - desvio / tolerancia });
    }
  }
  return salida;
}

// ── teseracto (hipercubo 4D) ─────────────────────────────────────────────────
export function teseractoVertices(): Vec4[] {
  const v: Vec4[] = [];
  for (let i = 0; i < 16; i++) v.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  return v;
}
/** Aristas: vértices que difieren en una sola coordenada (32). */
export function teseractoAristas(): Arista[] {
  const salida: Arista[] = [];
  for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) {
    const j = i ^ (1 << b);
    if (i < j) salida.push([i, j]);
  }
  return salida;
}

export type Plano4D = "xy" | "xz" | "xw" | "yz" | "yw" | "zw";
const EJES: Record<Plano4D, [number, number]> = { xy: [0, 1], xz: [0, 2], xw: [0, 3], yz: [1, 2], yw: [1, 3], zw: [2, 3] };

/** Rota un punto 4D en los planos dados (ángulos en radianes). Conserva la norma. */
export function rotar4D(v: Vec4, angulos: Partial<Record<Plano4D, number>>): Vec4 {
  const p: Vec4 = [...v] as Vec4;
  for (const plano of Object.keys(angulos) as Plano4D[]) {
    const a = angulos[plano] ?? 0;
    if (!a) continue;
    const [i, j] = EJES[plano];
    const c = Math.cos(a), s = Math.sin(a);
    const pi = p[i], pj = p[j];
    p[i] = pi * c - pj * s;
    p[j] = pi * s + pj * c;
  }
  return p;
}

/** Proyección en perspectiva 4D → 3D desde una cámara en w = `distancia`; devuelve también la profundidad w. */
export function proyectar4D(v: Vec4, distanciaW = 3): { p: Vec3; w: number } {
  const f = distanciaW / (distanciaW - v[3]);
  return { p: [v[0] * f, v[1] * f, v[2] * f], w: v[3] };
}

/** El teseracto girado en 4D y proyectado (radio 1), con la profundidad w de cada vértice (−1..1 aprox.). */
export function teseracto(angulos: Partial<Record<Plano4D, number>>, distanciaW = 3): FormaGeometrica & { w: number[] } {
  const proy = teseractoVertices().map((v) => proyectar4D(rotar4D(v, angulos), distanciaW));
  // Radio fijo para que la forma no «palpite» al girar: el mayor radio proyectado posible, max sobre w de
  // √(4 − w²)·d/(d − w) (≈ 2,66 con d = 3; con d = 3 el cubo interior mide la mitad que el exterior).
  let max = 0;
  for (let w = 0; w < 2; w += 0.005) max = Math.max(max, (Math.sqrt(4 - w * w) * distanciaW) / (distanciaW - w));
  return {
    vertices: proy.map(({ p }) => [p[0] / max, p[1] / max, p[2] / max]),
    w: proy.map(({ w }) => w / 2),
    aristas: teseractoAristas(),
    caras: [],
  };
}

// ── matriz isotrópica de vectores (base de la rejilla de 64 tetraedros) ──────
/**
 * Puntos de la red cúbica centrada en las caras (FCC) hasta la capa `frecuencia` de cuboctaedros
 * concéntricos (1 + 12 + 42 = 55 puntos con frecuencia 2) y sus aristas de vecinos más cercanos.
 */
export function matrizIsotropica(frecuencia = 2): FormaGeometrica {
  const v: Vec3[] = [];
  const f = frecuencia * 2;
  for (let x = -f; x <= f; x++) for (let y = -f; y <= f; y++) for (let z = -f; z <= f; z++) {
    if ((x + y + z) % 2 !== 0) continue;
    const capa = Math.max((Math.abs(x) + Math.abs(y) + Math.abs(z)) / 2, Math.abs(x), Math.abs(y), Math.abs(z));
    if (capa <= frecuencia) v.push([x, y, z]);
  }
  const norm = normalizar(v);
  const l = aristaMinima(norm);
  return { vertices: norm, aristas: aristasPorDistancia(norm, l, 0.01), caras: [] };
}

// ── esfera de Fibonacci (siembra y carga) ────────────────────────────────────
export function esferaFibonacci(n: number, radio = 1): Vec3[] {
  const salida: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = i * ANGULO_AUREO;
    salida.push([Math.cos(t) * r * radio, y * radio, Math.sin(t) * r * radio]);
  }
  return salida;
}

// ── semilla y flor de la vida, cubo de Metatrón (en el plano) ────────────────
/** Centros de la flor de la vida en una red hexagonal: anillos 1 → semilla (7), anillos 2 → flor (19). */
export function centrosFlorDeLaVida(anillos = 2, r = 1): [number, number][] {
  const salida: [number, number][] = [[0, 0]];
  const dirs: [number, number][] = Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]);
  for (let anillo = 1; anillo <= anillos; anillo++) {
    for (let k = 0; k < 6; k++) {
      const inicio: [number, number] = [dirs[k][0] * anillo * r, dirs[k][1] * anillo * r];
      const paso = dirs[(k + 2) % 6];
      for (let s = 0; s < anillo; s++) salida.push([inicio[0] + paso[0] * s * r, inicio[1] + paso[1] * s * r]);
    }
  }
  return salida;
}

/** Los 13 centros del cubo de Metatrón (semilla + anillo exterior a 2r) y sus 78 líneas (todos los pares). */
export function cuboDeMetatron(r = 1): { centros: [number, number][]; lineas: Arista[] } {
  const centros: [number, number][] = [[0, 0]];
  for (const radio of [r, 2 * r]) {
    for (let k = 0; k < 6; k++) centros.push([Math.cos((k * Math.PI) / 3 + Math.PI / 6) * radio, Math.sin((k * Math.PI) / 3 + Math.PI / 6) * radio]);
  }
  const lineas: Arista[] = [];
  for (let i = 0; i < centros.length; i++) for (let j = i + 1; j < centros.length; j++) lineas.push([i, j]);
  return { centros, lineas };
}

// ── reparto de partículas sobre una forma ────────────────────────────────────
/**
 * Coloca `n` partículas sobre las aristas, cada una con su arista y su fase (proporción áurea) para que
 * el motor las haga fluir por la estructura. Si la forma no tiene aristas, quedan sobre sus vértices.
 */
export function repartoEnAristas(forma: FormaGeometrica, n: number): { arista: number; fase: number }[] {
  const e = forma.aristas.length;
  return Array.from({ length: n }, (_, i) => ({ arista: e ? i % e : -1, fase: (i * (PHI - 1)) % 1 }));
}

/** Posición de una partícula que fluye por su arista (o en su vértice si no hay aristas). */
export function posicionEnArista(forma: FormaGeometrica, arista: number, t: number, i = 0): Vec3 {
  if (arista < 0 || !forma.aristas[arista]) {
    const v = forma.vertices[i % Math.max(1, forma.vertices.length)] ?? [0, 0, 0];
    return [v[0], v[1], v[2]];
  }
  const [p, q] = forma.aristas[arista];
  const a = forma.vertices[p], b = forma.vertices[q];
  const u = t - Math.floor(t);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
