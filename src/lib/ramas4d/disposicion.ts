/**
 * disposicion — física y disposiciones de Ramas 4D (MV1125C · parte 1 de 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Todo PURO y determinista (sin DOM, red, reloj ni `node:*`): la misma entrada y la
 * misma semilla producen exactamente las mismas posiciones. La distancia es afinidad.
 *
 * Cuatro disposiciones:
 *   · fuerza: repulsión Barnes-Hut (octree.ts), resortes por intensidad y gravedad al centro.
 *   · radial: árbol de rutas y carpetas por anillos de profundidad.
 *   · espiral temporal: eje del tiempo en espiral (z = tiempo).
 *   · planos por capa: una capa por altura, repartida en espiral áurea.
 */

import { fuerzasBarnesHut } from './octree';

export interface AristaDisposicion {
  de: number;
  a: number;
  /** 0..1 o más: cuánto tira esta arista. */
  intensidad: number;
}

export interface OpcionesDisposicion {
  semilla?: number;
  iteraciones?: number;
  /** Fuerza de repulsión entre nodos. */
  G?: number;
  theta?: number;
  suavizado?: number;
  resorteBase?: number;
  longitudResorte?: number;
  gravedad?: number;
  amortiguacion?: number;
  paso?: number;
  maxVelocidad?: number;
  radioInicial?: number;
}

export interface EstadoDisposicion {
  posiciones: Float32Array;
  velocidades: Float32Array;
  iteracion: number;
}

interface OpcionesResueltas {
  semilla: number;
  iteraciones: number;
  G: number;
  theta: number;
  suavizado: number;
  resorteBase: number;
  longitudResorte: number;
  gravedad: number;
  amortiguacion: number;
  paso: number;
  maxVelocidad: number;
  radioInicial: number;
}

function resolver(opciones: OpcionesDisposicion | undefined, n: number): OpcionesResueltas {
  return {
    semilla: opciones?.semilla ?? 1,
    iteraciones: Math.max(0, Math.floor(opciones?.iteraciones ?? 120)),
    G: opciones?.G ?? 3,
    theta: opciones?.theta ?? 0.7,
    suavizado: opciones?.suavizado ?? 0.6,
    resorteBase: opciones?.resorteBase ?? 0.35,
    longitudResorte: opciones?.longitudResorte ?? 2.5,
    gravedad: opciones?.gravedad ?? 0.02,
    amortiguacion: opciones?.amortiguacion ?? 0.85,
    paso: opciones?.paso ?? 0.2,
    maxVelocidad: opciones?.maxVelocidad ?? 4,
    radioInicial: opciones?.radioInicial ?? 2 * Math.sqrt(Math.max(1, n)),
  };
}

/** PRNG mulberry32: rápido, pequeño y determinista por semilla. */
function crearAleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function posicionesIniciales(n: number, radio: number, semilla: number): Float32Array {
  const aleatorio = crearAleatorio(semilla);
  const posiciones = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const angulo = aleatorio() * Math.PI * 2;
    const altura = aleatorio() * 2 - 1;
    const radioPlano = Math.sqrt(Math.max(0, 1 - altura * altura));
    const r = radio * Math.cbrt(aleatorio());
    posiciones[i * 3] = r * radioPlano * Math.cos(angulo);
    posiciones[i * 3 + 1] = r * radioPlano * Math.sin(angulo);
    posiciones[i * 3 + 2] = r * altura;
  }
  return posiciones;
}

export function crearEstadoFuerza(
  n: number,
  opciones?: OpcionesDisposicion,
): EstadoDisposicion {
  const total = Math.max(0, Math.floor(n));
  const cfg = resolver(opciones, total);
  return {
    posiciones: posicionesIniciales(total, cfg.radioInicial, cfg.semilla),
    velocidades: new Float32Array(total * 3),
    iteracion: 0,
  };
}

/** Un paso de integración de la física. No muta el estado: devuelve uno nuevo. */
export function pasoFuerza(
  estado: EstadoDisposicion,
  aristas: AristaDisposicion[],
  opciones?: OpcionesDisposicion,
): EstadoDisposicion {
  const n = Math.floor(estado.posiciones.length / 3);
  const cfg = resolver(opciones, n);
  const posiciones = estado.posiciones;
  const velocidades = new Float32Array(estado.velocidades);
  const siguiente = new Float32Array(posiciones);
  if (n === 0) return { posiciones: siguiente, velocidades, iteracion: estado.iteracion + 1 };

  const fuerzas = fuerzasBarnesHut(posiciones, undefined, {
    theta: cfg.theta,
    G: -cfg.G,
    suavizado: cfg.suavizado,
  });

  for (const arista of aristas) {
    const i = arista.de;
    const j = arista.a;
    if (i < 0 || j < 0 || i >= n || j >= n || i === j) continue;
    const dx = posiciones[j * 3] - posiciones[i * 3];
    const dy = posiciones[j * 3 + 1] - posiciones[i * 3 + 1];
    const dz = posiciones[j * 3 + 2] - posiciones[i * 3 + 2];
    const distancia = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const k = cfg.resorteBase * (arista.intensidad || 1);
    const factor = (k * (distancia - cfg.longitudResorte)) / distancia;
    fuerzas[i * 3] += factor * dx;
    fuerzas[i * 3 + 1] += factor * dy;
    fuerzas[i * 3 + 2] += factor * dz;
    fuerzas[j * 3] -= factor * dx;
    fuerzas[j * 3 + 1] -= factor * dy;
    fuerzas[j * 3 + 2] -= factor * dz;
  }

  for (let i = 0; i < n; i++) {
    fuerzas[i * 3] -= cfg.gravedad * posiciones[i * 3];
    fuerzas[i * 3 + 1] -= cfg.gravedad * posiciones[i * 3 + 1];
    fuerzas[i * 3 + 2] -= cfg.gravedad * posiciones[i * 3 + 2];
  }

  for (let i = 0; i < n; i++) {
    let vx = (velocidades[i * 3] + fuerzas[i * 3] * cfg.paso) * cfg.amortiguacion;
    let vy = (velocidades[i * 3 + 1] + fuerzas[i * 3 + 1] * cfg.paso) * cfg.amortiguacion;
    let vz = (velocidades[i * 3 + 2] + fuerzas[i * 3 + 2] * cfg.paso) * cfg.amortiguacion;
    const rapidez = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (cfg.maxVelocidad > 0 && rapidez > cfg.maxVelocidad) {
      const escala = cfg.maxVelocidad / rapidez;
      vx *= escala;
      vy *= escala;
      vz *= escala;
    }
    velocidades[i * 3] = vx;
    velocidades[i * 3 + 1] = vy;
    velocidades[i * 3 + 2] = vz;
    siguiente[i * 3] = posiciones[i * 3] + vx * cfg.paso;
    siguiente[i * 3 + 1] = posiciones[i * 3 + 1] + vy * cfg.paso;
    siguiente[i * 3 + 2] = posiciones[i * 3 + 2] + vz * cfg.paso;
  }

  return { posiciones: siguiente, velocidades, iteracion: estado.iteracion + 1 };
}

/** Corre la física completa desde cero y devuelve las posiciones finales. */
export function disposicionFuerza(
  n: number,
  aristas: AristaDisposicion[],
  opciones?: OpcionesDisposicion,
): Float32Array {
  const cfg = resolver(opciones, n);
  let estado = crearEstadoFuerza(n, opciones);
  for (let k = 0; k < cfg.iteraciones; k++) {
    estado = pasoFuerza(estado, aristas, opciones);
  }
  return estado.posiciones;
}

/**
 * Energía potencial del sistema (resortes + gravedad + repulsión).
 * O(n²) por la repulsión exacta: pensada para lotes pequeños y pruebas de convergencia.
 */
export function energiaDisposicion(
  posiciones: Float32Array,
  aristas: AristaDisposicion[],
  opciones?: OpcionesDisposicion,
): number {
  const n = Math.floor(posiciones.length / 3);
  const cfg = resolver(opciones, n);
  let energia = 0;
  for (let i = 0; i < n; i++) {
    const x = posiciones[i * 3];
    const y = posiciones[i * 3 + 1];
    const z = posiciones[i * 3 + 2];
    energia += 0.5 * cfg.gravedad * (x * x + y * y + z * z);
  }
  for (const arista of aristas) {
    const i = arista.de;
    const j = arista.a;
    if (i < 0 || j < 0 || i >= n || j >= n || i === j) continue;
    const dx = posiciones[j * 3] - posiciones[i * 3];
    const dy = posiciones[j * 3 + 1] - posiciones[i * 3 + 1];
    const dz = posiciones[j * 3 + 2] - posiciones[i * 3 + 2];
    const distancia = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const k = cfg.resorteBase * (arista.intensidad || 1);
    const desvio = distancia - cfg.longitudResorte;
    energia += 0.5 * k * desvio * desvio;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = posiciones[j * 3] - posiciones[i * 3];
      const dy = posiciones[j * 3 + 1] - posiciones[i * 3 + 1];
      const dz = posiciones[j * 3 + 2] - posiciones[i * 3 + 2];
      const distancia = Math.sqrt(dx * dx + dy * dy + dz * dz);
      energia += cfg.G / (distancia + cfg.suavizado);
    }
  }
  return energia;
}

export interface OpcionesRadial {
  /** Radio entre anillos de profundidad. */
  radioAnillo?: number;
  /** Altura por nivel (da volumen 3D al árbol). */
  alturaAnillo?: number;
}

/**
 * Árbol radial para rutas y carpetas: `padres[i]` es el índice del padre (-1 = raíz).
 * La raíz queda en el origen y cada profundidad ocupa un anillo; las huérfanas van al final.
 */
export function disposicionRadial(
  padres: ArrayLike<number>,
  opciones?: OpcionesRadial,
): Float32Array {
  const n = padres.length;
  const posiciones = new Float32Array(n * 3);
  if (n === 0) return posiciones;
  const radio = opciones?.radioAnillo ?? 1;
  const altura = opciones?.alturaAnillo ?? 0.4;
  const hijos: number[][] = [];
  const raices: number[] = [];
  for (let i = 0; i < n; i++) hijos.push([]);
  for (let i = 0; i < n; i++) {
    const padre = padres[i];
    if (padre >= 0 && padre < n && padre !== i) hijos[padre].push(i);
    else raices.push(i);
  }
  const profundidad = new Int32Array(n).fill(-1);
  const cola: number[] = [];
  for (const raiz of raices) {
    profundidad[raiz] = 0;
    cola.push(raiz);
  }
  for (let q = 0; q < cola.length; q++) {
    const i = cola[q];
    for (const hijo of hijos[i]) {
      if (profundidad[hijo] === -1) {
        profundidad[hijo] = profundidad[i] + 1;
        cola.push(hijo);
      }
    }
  }
  let maxProfundidad = 0;
  for (let i = 0; i < n; i++) if (profundidad[i] > maxProfundidad) maxProfundidad = profundidad[i];
  for (let i = 0; i < n; i++) if (profundidad[i] === -1) profundidad[i] = maxProfundidad + 1;

  const niveles: number[][] = [];
  for (let i = 0; i < n; i++) {
    const d = profundidad[i];
    while (niveles.length <= d) niveles.push([]);
    niveles[d].push(i);
  }
  for (let d = 0; d < niveles.length; d++) {
    const nivel = niveles[d];
    if (nivel.length === 0) continue;
    const radioNivel = d === 0 ? (nivel.length === 1 ? 0 : radio) : d * radio;
    const desfase = d * 0.6;
    for (let k = 0; k < nivel.length; k++) {
      const angulo = (Math.PI * 2 * k) / nivel.length + desfase;
      const i = nivel[k];
      posiciones[i * 3] = Math.cos(angulo) * radioNivel;
      posiciones[i * 3 + 1] = d * altura;
      posiciones[i * 3 + 2] = Math.sin(angulo) * radioNivel;
    }
  }
  return posiciones;
}

export interface OpcionesEspiral {
  vueltas?: number;
  radioBase?: number;
  radioPorTiempo?: number;
  altura?: number;
}

/**
 * Espiral temporal: cada nodo se sitúa según su tiempo (z = tiempo) y gira en espiral.
 * Si todos los tiempos coinciden, se reparten por índice para no solaparse.
 */
export function disposicionEspiralTemporal(
  tiempos: ArrayLike<number>,
  opciones?: OpcionesEspiral,
): Float32Array {
  const n = tiempos.length;
  const posiciones = new Float32Array(n * 3);
  if (n === 0) return posiciones;
  const vueltas = opciones?.vueltas ?? 3;
  const radioBase = opciones?.radioBase ?? 1;
  const radioPorTiempo = opciones?.radioPorTiempo ?? 6;
  const altura = opciones?.altura ?? 8;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const t = tiempos[i];
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }
  const rango = tMax - tMin;
  for (let i = 0; i < n; i++) {
    const u = rango > 0 ? (tiempos[i] - tMin) / rango : n > 1 ? i / (n - 1) : 0;
    const angulo = u * vueltas * Math.PI * 2;
    const radio = radioBase + u * radioPorTiempo;
    posiciones[i * 3] = Math.cos(angulo) * radio;
    posiciones[i * 3 + 1] = Math.sin(angulo) * radio;
    posiciones[i * 3 + 2] = u * altura;
  }
  return posiciones;
}

export interface OpcionesPlanos {
  /** Distancia vertical entre capas. */
  separacion?: number;
  /** Radio del disco de cada capa. */
  radio?: number;
}

const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));

/**
 * Planos por capa: una capa por altura (z), cada una repartida en espiral áurea.
 * Las capas se ordenan de forma determinista (numérica si todas son números).
 */
export function disposicionPlanosPorCapa(
  capas: ArrayLike<string | number>,
  opciones?: OpcionesPlanos,
): Float32Array {
  const n = capas.length;
  const posiciones = new Float32Array(n * 3);
  if (n === 0) return posiciones;
  const separacion = opciones?.separacion ?? 2.5;
  const radio = opciones?.radio ?? 1;
  const claves: string[] = [];
  const vistas = new Set<string>();
  for (let i = 0; i < n; i++) {
    const clave = String(capas[i]);
    if (!vistas.has(clave)) {
      vistas.add(clave);
      claves.push(clave);
    }
  }
  const numericas = claves.every((c) => c.trim() !== '' && Number.isFinite(Number(c)));
  claves.sort(numericas ? (a, b) => Number(a) - Number(b) : undefined);
  const indiceCapa = new Map<string, number>();
  for (let k = 0; k < claves.length; k++) indiceCapa.set(claves[k], k);
  const grupos: number[][] = claves.map(() => []);
  for (let i = 0; i < n; i++) {
    const k = indiceCapa.get(String(capas[i]));
    if (k !== undefined) grupos[k].push(i);
  }
  for (let g = 0; g < grupos.length; g++) {
    const grupo = grupos[g];
    for (let k = 0; k < grupo.length; k++) {
      const i = grupo[k];
      const r = grupo.length === 1 ? 0 : radio * Math.sqrt((k + 0.5) / grupo.length);
      const angulo = k * ANGULO_AUREO + g * 0.5;
      posiciones[i * 3] = Math.cos(angulo) * r;
      posiciones[i * 3 + 1] = Math.sin(angulo) * r;
      posiciones[i * 3 + 2] = g * separacion;
    }
  }
  return posiciones;
}
