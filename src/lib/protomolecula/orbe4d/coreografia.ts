/**
 * Orbe 4D de la Protomolécula · COREOGRAFÍA (lógica PURA: sin three.js, sin React, sin `node:*`).
 *
 * El «bot de diseño 4D» decide aquí, sin dibujar nada: qué forma toma, con qué paleta según el contexto,
 * a qué ritmo respira y cómo responde a lo que pasa (atención del puntero, arrastre, la voz de Astraura,
 * la Protomolécula creando, una carga o un diseño 3D recién generado). El motor (`motor.ts`) solo obedece.
 *
 * Numerología y proporción (fundamentos de la marca, ver la skill starseed-estudio):
 *   · tiempos de Fibonacci: 3, 5, 8, 13, 21, 34 y 55 s; las transiciones duran φ segundos;
 *   · 144 partículas (12², el duodécimo número de Fibonacci) en el estilo expresivo, 89 en el sobrio y 233
 *     en el experimental; 12 vértices del equilibrio vectorial; la flor de la vida con 19 círculos;
 *   · el halo mide φ veces la forma; el brillo de acento cubre ≈ 15 % del cuadro (firma de la marca).
 * Colores: SOLO los de la marca (`adn-y-tokens.md` §2 y §6), nunca hexadecimales inventados.
 */
import { PHI } from "./geometria";

export type IdForma = "semilla" | "merkaba" | "jitterbug" | "teseracto" | "dodecaedro" | "matriz" | "icosaedro" | "modelo";
export type Registro = "protomolecula" | "trinity" | "astraura" | "genesis" | "malla" | "audiomorphic" | "alquimia" | "exploracion";
export type Estilo = "sobria" | "expresiva" | "experimental";
export type Modo = "reposo" | "atento" | "arrastre" | "hablando" | "creando" | "cargando" | "transformando" | "encendiendo" | "apagando";

export const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233] as const;
export const ESTILO_DEFECTO: Estilo = "expresiva";
export const ESTILOS_VALIDOS: readonly Estilo[] = ["sobria", "expresiva", "experimental"];

export interface Paleta {
  /** Colores de la estructura y de las partículas, en orden de protagonismo. */
  colores: string[];
  /** Destello especular (siempre nieve de la marca). */
  brillo: string;
  /** Color del halo y del brillo de acento. */
  halo: string;
}

/** Paletas por registro de identidad (`adn-y-tokens.md` §2 y §6). */
export const PALETAS: Record<Registro, Paleta> = {
  // Creación (horizonte), transformación (violeta Audiomorphic), IA (cian Astraura) y alquimia (oro).
  protomolecula: { colores: ["#10B981", "#A855F7", "#00F0FF", "#D4AF37"], brillo: "#F8F9FA", halo: "#10B981" },
  trinity: { colores: ["#007FFF", "#10B981", "#FFBF00", "#DC143C"], brillo: "#F8F9FA", halo: "#007FFF" },
  astraura: { colores: ["#00F0FF", "#007FFF", "#A78BFA"], brillo: "#F8F9FA", halo: "#00F0FF" },
  genesis: { colores: ["#22D3EE", "#A78BFA", "#FBBF24"], brillo: "#F8F9FA", halo: "#22D3EE" },
  malla: { colores: ["#06B6D4", "#67E8F9", "#10B981", "#0C4A6E"], brillo: "#F8F9FA", halo: "#06B6D4" },
  audiomorphic: { colores: ["#A855F7", "#D4AF37", "#2DD29B"], brillo: "#F8F9FA", halo: "#A855F7" },
  alquimia: { colores: ["#FFBF00", "#D4AF37", "#E9C46A", "#10B981"], brillo: "#F8F9FA", halo: "#FFBF00" },
  exploracion: { colores: ["#10B981", "#A855F7", "#0D4068"], brillo: "#F8F9FA", halo: "#A855F7" },
};

/** El registro según dónde está la persona: la orbe se vuelve coherente con cada contexto del OS. */
export function registroPorRuta(ruta: string | null | undefined): Registro {
  const r = (ruta || "/").toLowerCase();
  const empieza = (...prefijos: string[]) => prefijos.some((p) => r === p || r.startsWith(p + "/") || r.startsWith(p + "?"));
  if (empieza("/genesis", "/mando", "/metagenesis", "/poligenesis")) return "genesis";
  if (empieza("/agent", "/aurora", "/imaginacion", "/exocortex", "/astraura")) return "astraura";
  if (empieza("/red-mesh", "/senales", "/malla", "/red-3d", "/sincronizacion")) return "malla";
  if (empieza("/voces", "/audiomorphic", "/musica")) return "audiomorphic";
  if (empieza("/xr", "/multiverso", "/vr", "/ar")) return "exploracion";
  if (r === "/" || empieza("/escritorios", "/dashboard")) return "trinity";
  return "protomolecula";
}

export interface ParametrosEstilo {
  particulas: number;
  /** Multiplicador de todas las velocidades. */
  velocidad: number;
  opacidadCaras: number;
  opacidadHalo: number;
  /** Segundos que dura cada forma de la secuencia en reposo. */
  permanenciaS: number;
  /** Segundos de una transformación entre formas. */
  transicionS: number;
  /** Cuánto deriva el tono con el tiempo (0 = fiel a la paleta). */
  derivaTono: number;
  secuencia: IdForma[];
}

export const ESTILOS: Record<Estilo, ParametrosEstilo> = {
  sobria: { particulas: 89, velocidad: 0.62, opacidadCaras: 0.16, opacidadHalo: 0.14, permanenciaS: 21, transicionS: PHI * 1.6, derivaTono: 0, secuencia: ["merkaba", "jitterbug"] },
  expresiva: {
    particulas: 144, velocidad: 1, opacidadCaras: 0.3, opacidadHalo: 0.22, permanenciaS: 13, transicionS: PHI, derivaTono: 0.04,
    secuencia: ["merkaba", "jitterbug", "teseracto", "dodecaedro", "matriz", "icosaedro"],
  },
  experimental: {
    particulas: 233, velocidad: PHI, opacidadCaras: 0.4, opacidadHalo: 0.3, permanenciaS: 8, transicionS: 1, derivaTono: 0.12,
    secuencia: ["semilla", "merkaba", "jitterbug", "teseracto", "matriz", "dodecaedro", "icosaedro"],
  },
};

export function estiloValido(x: unknown): Estilo {
  return typeof x === "string" && (ESTILOS_VALIDOS as readonly string[]).includes(x) ? (x as Estilo) : ESTILO_DEFECTO;
}

export interface FichaForma {
  nombre: string;
  /** Qué simboliza (se enseña en el panel de la orbe). */
  sentido: string;
  /** Su número: vértices, caras o la cuenta que la define. */
  numero: string;
}

export const FICHAS: Record<IdForma, FichaForma> = {
  semilla: { nombre: "Semilla", sentido: "La siembra: 144 puntos en la espiral áurea antes de tomar forma.", numero: "144 = 12²" },
  merkaba: { nombre: "Merkaba", sentido: "Dos tetraedros que giran en sentidos opuestos: lo que crea y lo que recibe.", numero: "8 vértices · 2 × 4" },
  jitterbug: { nombre: "Equilibrio vectorial", sentido: "El jitterbug de Fuller: el cuboctaedro se pliega en icosaedro y octaedro sin romper sus triángulos.", numero: "12 vértices · 8 triángulos" },
  teseracto: { nombre: "Teseracto", sentido: "El cubo de cuatro dimensiones girando en el plano del tiempo.", numero: "16 vértices · 32 aristas" },
  dodecaedro: { nombre: "Dodecaedro", sentido: "El éter: doce pentágonos de proporción áurea.", numero: "12 caras · 20 vértices" },
  matriz: { nombre: "Matriz isotrópica", sentido: "La red de vectores iguales donde todo se construye: la base de la rejilla de 64 tetraedros.", numero: "55 puntos · frecuencia 2" },
  icosaedro: { nombre: "Icosaedro", sentido: "El agua: veinte triángulos que fluyen.", numero: "20 caras · 12 vértices" },
  modelo: { nombre: "Tu diseño 3D", sentido: "La orbe toma la forma del modelo que acabas de generar.", numero: "377 puntos de su superficie" },
};

/** La forma que pide cada modo; en reposo, la que toca en la secuencia del estilo. */
export function formaParaModo(modo: Modo, secuencia: IdForma[], indice: number, hayModelo: boolean): IdForma {
  if (modo === "cargando" || modo === "encendiendo" || modo === "apagando") return "semilla";
  if (modo === "creando") return "matriz";
  if (modo === "hablando") return "jitterbug";
  if (modo === "transformando" && hayModelo) return "modelo";
  const s = secuencia.length ? secuencia : ESTILOS[ESTILO_DEFECTO].secuencia;
  return s[((indice % s.length) + s.length) % s.length];
}

/** El registro que manda en cada modo: crear es alquimia (oro); hablar es la voz de Astraura. */
export function registroParaModo(modo: Modo, base: Registro): Registro {
  if (modo === "creando") return "alquimia";
  if (modo === "hablando") return base === "trinity" || base === "protomolecula" ? "astraura" : base;
  return base;
}

/**
 * Energía 0..φ² que acelera giros y aviva el brillo. `atencion` (0..1) es el puntero cerca o encima;
 * `voz` (0..1) el pulso del habla de Astraura; `arrastre` (0..1) la velocidad al arrastrar.
 */
export function energia(modo: Modo, atencion: number, voz: number, arrastre: number): number {
  const base: Record<Modo, number> = {
    reposo: 1, atento: 1.25, arrastre: 1.4, hablando: 1.3, creando: PHI, cargando: 1.2, transformando: 1.3, encendiendo: 1.5, apagando: 0.8,
  };
  const e = base[modo] * (1 + 0.6 * clamp01(atencion)) + 0.8 * clamp01(voz) + 0.6 * clamp01(arrastre);
  return Math.min(PHI * PHI, e);
}

/** Periodos (s) de los giros: números de Fibonacci, divididos por la energía. */
export function periodos(energiaActual: number, velocidad: number) {
  const k = Math.max(0.2, energiaActual * velocidad);
  return {
    giroGlobal: 34 / k,
    jitterbug: 13 / k,
    merkaba: 13 / k,
    teseractoXW: 21 / k,
    teseractoYW: 34 / k,
    teseractoZW: 55 / k,
    halo: 89 / k,
    flujo: 5 / k,
  };
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Curva orgánica de la marca, `cubic-bezier(0.22, 1, 0.36, 1)`, resuelta por Newton. */
export function curvaOrganica(t: number): number {
  return bezier(0.22, 1, 0.36, 1, clamp01(t));
}

function bezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const d = dx(t);
    if (Math.abs(d) < 1e-6) break;
    t -= (fx(t) - x) / d;
  }
  t = clamp01(t);
  return ((ay * t + by) * t + cy) * t;
}

/** Retraso de cada partícula en una transformación (escalonado por la proporción áurea, 0..0.35). */
export function retrasoParticula(i: number): number {
  return ((i * (PHI - 1)) % 1) * 0.35;
}

/** Avance 0..1 de la partícula `i` cuando la transformación global va por `k`. */
export function avanceParticula(k: number, i: number): number {
  const r = retrasoParticula(i);
  return curvaOrganica((clamp01(k) - r) / (1 - r));
}

/** Mezcla dos colores hex `#RRGGBB` (t = 0 → a, 1 → b). */
export function mezclarHex(a: string, b: string, t: number): [number, number, number] {
  const pa = hexARgb(a), pb = hexARgb(b), k = clamp01(t);
  return [pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k, pa[2] + (pb[2] - pa[2]) * k];
}

export function hexARgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Color de la paleta para una posición continua `u` (se recorre en bucle y se funde entre vecinos). */
export function colorEnPaleta(p: Paleta, u: number): [number, number, number] {
  const n = p.colores.length;
  const x = (((u % 1) + 1) % 1) * n;
  const i = Math.floor(x);
  return mezclarHex(p.colores[i % n], p.colores[(i + 1) % n], x - i);
}

/** Calidad que se adapta al aparato: con cuadros lentos, menos partículas y sin caras; con margen, todo. */
export function calidadPorRendimiento(msPorCuadro: number, particulasEstilo: number): { particulas: number; caras: boolean; halo: boolean } {
  if (msPorCuadro > 34) return { particulas: Math.min(55, particulasEstilo), caras: false, halo: false };
  if (msPorCuadro > 22) return { particulas: Math.min(89, particulasEstilo), caras: true, halo: false };
  return { particulas: particulasEstilo, caras: true, halo: true };
}
