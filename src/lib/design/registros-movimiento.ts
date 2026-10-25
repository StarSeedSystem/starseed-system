/**
 * REGISTROS DE MOVIMIENTO POR SECCIÓN (Ola 1024D · DAN1024B)
 * ─────────────────────────────────────────────────────────────────────────────
 * Traduce un registro de diseño (sobrio, expresivo, experimental) y una sección
 * del OS a tokens de movimiento listos para consumir. Módulo PURO: sin DOM, sin
 * reloj, sin red y sin disco.
 *
 * Las duraciones y curvas salen SIEMPRE de `movimiento.ts`, la única fuente del
 * OS: aquí no se inventa ni un milisegundo de entrada/salida. La cascada y la
 * respiración son parámetros de composición acotados (respiración 1–1,03 y
 * 3500–6000 ms) que dan identidad a cada sección sin romper esa gramática.
 */

import { CURVA, DURACION } from "@/lib/design/movimiento";

/** Carácter general del movimiento de una pieza o una cuenta. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Superficies con identidad de gesto propia dentro del OS. */
export type SeccionMovimiento =
  | "trinity" | "astraura" | "genesis" | "malla" | "biblioteca" | "protomolecula";

/** Un tramo de movimiento: cuánto dura y con qué curva. */
export interface TramoMovimiento { ms: number; curva: string; }

/** Respiración sutil del elemento en reposo. */
export interface RespiracionMovimiento { escala: number; periodoMs: number; }

/** Perfil completo que consume un componente. */
export interface MovimientoSeccion {
  entrada: TramoMovimiento;
  salida: TramoMovimiento;
  cascadaMs: number;
  respiracion: RespiracionMovimiento;
}

/** Rasgos de movimiento que aporta cada registro. */
interface RasgosRegistro {
  entrada: TramoMovimiento;
  salida: TramoMovimiento;
  /** Extra de respiración del registro, sumado a la base de la sección. */
  respiracionExtra: number;
}

/** Rasgos de identidad que aporta cada sección. */
interface RasgosSeccion {
  cascadaMs: number;
  escalaBase: number;
  periodoMs: number;
}

/**
 * Sobrio: sin elástico, tiempos neutros.
 * Expresivo: responde al gesto, sin rebote.
 * Experimental: el único que admite elástico, y solo al entrar.
 */
const REGISTROS: Record<RegistroMovimiento, RasgosRegistro> = {
  sobrio: {
    entrada: { ms: DURACION.normal, curva: CURVA.suave },
    salida: { ms: DURACION.rapido, curva: CURVA.salida },
    respiracionExtra: 0,
  },
  expresivo: {
    entrada: { ms: DURACION.pausado, curva: CURVA.entrada },
    salida: { ms: DURACION.normal, curva: CURVA.salida },
    respiracionExtra: 0.01,
  },
  experimental: {
    entrada: { ms: DURACION.escena, curva: CURVA.elastico },
    salida: { ms: DURACION.pausado, curva: CURVA.salida },
    respiracionExtra: 0.02,
  },
};

/** Cada sección late a su ritmo, pero todas caben en los límites del OS. */
const SECCIONES: Record<SeccionMovimiento, RasgosSeccion> = {
  trinity: { cascadaMs: 40, escalaBase: 1, periodoMs: 4200 },
  astraura: { cascadaMs: 36, escalaBase: 1.01, periodoMs: 5000 },
  genesis: { cascadaMs: 44, escalaBase: 1.005, periodoMs: 4500 },
  malla: { cascadaMs: 32, escalaBase: 1, periodoMs: 3800 },
  biblioteca: { cascadaMs: 48, escalaBase: 1.005, periodoMs: 5200 },
  protomolecula: { cascadaMs: 52, escalaBase: 1.01, periodoMs: 6000 },
};

function acotar(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Combina registro y sección; la salida siempre dura menos que la entrada. */
export function movimientoDe(
  registro: RegistroMovimiento,
  seccion: SeccionMovimiento,
): MovimientoSeccion {
  const r = REGISTROS[registro];
  const s = SECCIONES[seccion];
  return {
    entrada: { ...r.entrada },
    salida: { ...r.salida },
    cascadaMs: s.cascadaMs,
    respiracion: {
      escala: acotar(s.escalaBase + r.respiracionExtra, 1, 1.03),
      periodoMs: acotar(s.periodoMs, 3500, 6000),
    },
  };
}

/** Movimiento reducido: todo a 0 ms y respiración a escala 1 (estado final). */
export function aplicarMovimientoReducido(r: MovimientoSeccion): MovimientoSeccion {
  return {
    entrada: { ms: 0, curva: r.entrada.curva },
    salida: { ms: 0, curva: r.salida.curva },
    cascadaMs: 0,
    respiracion: { escala: 1, periodoMs: 0 },
  };
}
