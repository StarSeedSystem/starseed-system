/**
 * conversacion-fluida.ts — Plática fluida de Astraura (VZR1011D · Ola 1011I).
 * ============================================================================
 * Contrato: `architecture/astraura-voces-y-robots.md` §2. Para CONVERSACIÓN:
 *   · El motor se elige por la LATENCIA MEDIDA en esta neurona (primer sonido y
 *     factor de tiempo real, medidas de `medidas-voz.ts`), no por la teórica;
 *     presupuesto de 0,8 s hasta el primer sonido.
 *   · La voz empieza con la primera frase mientras el modelo de lenguaje sigue
 *     escribiendo (troceo de `src/lib/voces/trocear.ts`) y la frase siguiente se
 *     sintetiza mientras suena la anterior.
 *   · Si la persona empieza a hablar, corte al instante (interrupción < 100 ms).
 *   · Capas: aparato › otra neurona de la cuenta en la red local › malla del
 *     grupo › Spaces › voz del sistema; lo que no llega al presupuesto pasa al
 *     siguiente sin silencios.
 * En LECTURA o narración manda la calidad: el orden teórico de la cadena queda
 * intacto.
 *
 * TODO aquí es PURO (sin red, sin disco, sin relojes): una función recibe
 * números y devuelve números, y las pruebas la mueven con relojes y motores
 * simulados. `speak-router.ts` la alimenta con las medidas reales y `leerMedidas`.
 * NUNCA lanza.
 */

import { trocearTexto } from "@/lib/voces/trocear";

// ── Presupuestos ─────────────────────────────────────────────────────────────

/** En plática, el primer sonido debe salir en ≤ 0,8 s (contrato §2.1). */
export const PRESUPUESTO_PRIMER_SONIDO_MS = 800;
/** Interrupción: de «empieza a hablar» a «se calló la voz» en < 100 ms (§2.3). */
export const LIMITE_INTERRUPCION_MS = 100;

/** Modo del turno: en conversación manda la latencia; en lectura, la calidad. */
export type ModoHabla = "conversacion" | "lectura";

/** Modo según la config de voz: AUTO encendido = conversación; apagado = lectura. */
export function modoHablaDe(cfg: { auto?: boolean }): ModoHabla {
  return cfg.auto === false ? "lectura" : "conversacion";
}

// ── Medidas por motor ────────────────────────────────────────────────────────

export interface MedidaSuelta {
  motor: string;
  tipo: string;
  valor: number;
  timestamp: number;
}

export interface MedidaMotor {
  motor: string;
  /** Mediana del «primer-sonido» medido aquí (ms), sin medida si nunca sonó. */
  primerSonidoMs?: number;
  /** Último factor de tiempo real informado por el motor (menor = mejor). */
  factorTiempoReal?: number;
}

/** Agrega medidas sueltas por motor: mediana de primer-sonido, último RTF. Pura. */
export function medidasPorMotor(medidas: readonly MedidaSuelta[]): MedidaMotor[] {
  const filas = [...medidas]
    .filter((m) => typeof m?.motor === "string" && m.motor.trim() !== "")
    .sort((a, b) => a.timestamp - b.timestamp);
  const porMotor = new Map<string, MedidaMotor>();
  for (const m of filas) {
    const fila = porMotor.get(m.motor) ?? { motor: m.motor };
    if (m.tipo === "primer-sonido" && typeof m.valor === "number" && m.valor >= 0) {
      fila.primerSonidoMs = mediana(conPrimeros(filas, m.motor));
    }
    if (m.tipo === "tiempo-real-voz" && typeof m.valor === "number" && m.valor > 0) {
      fila.factorTiempoReal = m.valor;
    }
    porMotor.set(m.motor, fila);
  }
  return [...porMotor.values()];
}

function conPrimeros(filas: readonly MedidaSuelta[], motor: string): number[] {
  return filas
    .filter((m) => m.motor === motor && m.tipo === "primer-sonido" && Number.isFinite(m.valor))
    .map((m) => m.valor);
}

function mediana(v: number[]): number | undefined {
  if (!v.length) return undefined;
  const s = [...v].sort((a, b) => a - b);
  const medio = Math.floor(s.length / 2);
  return s.length % 2 ? s[medio] : Math.round((s[medio - 1] + s[medio]) / 2);
}

// ── Cadena por latencia medida ───────────────────────────────────────────────

/**
 * reordenarPorLatenciaMedida — orden de la cadena por lo MEDIDO, no lo teórico.
 * EN CONVERSACIÓN: delante los motores con primer sonido MEDIDO dentro del
 * presupuesto (por su primer sonido, y a igual medida por menor factor tiempo
 * real); detrás los sin medida (lo no comprobado no desplaza a lo medido) y, al
 * final, los medidos LENTOS (no se tiran: relevan sin silencios si todo lo demás
 * cae). EN LECTURA: el orden que llega queda intacto (manda la calidad). Pura.
 */
export function reordenarPorLatenciaMedida<T extends string>(
  cadena: readonly T[],
  medidas: readonly MedidaMotor[],
  modo: ModoHabla = "conversacion",
  presupuestoMs: number = PRESUPUESTO_PRIMER_SONIDO_MS,
): T[] {
  if (modo === "lectura") return [...cadena];
  try {
    const m = new Map(medidas.map((x) => [x.motor, x] as const));
    const medido = (id: T): number | null => {
      const v = m.get(id)?.primerSonidoMs;
      return typeof v === "number" ? v : null;
    };
    // Rango: 0 = medido dentro del presupuesto · 1 = sin medida (orden teórico)
    // · 2 = medido lento (relevo de fondo, por si todo lo demás cae).
    const rango = (id: T): 0 | 1 | 2 => {
      const p = medido(id);
      return p === null ? 1 : p <= presupuestoMs ? 0 : 2;
    };
    const lentoAntesQue = (a: T, b: T): number => {
      const fa = m.get(a)?.factorTiempoReal ?? Number.POSITIVE_INFINITY;
      const fb = m.get(b)?.factorTiempoReal ?? Number.POSITIVE_INFINITY;
      return fa - fb;
    };
    return [...cadena]
      .map((id, i) => ({ id, i }))
      .sort((a, b) => {
        const d = rango(a.id) - rango(b.id);
        if (d) return d;
        if (rango(a.id) === 1) return a.i - b.i; // sin medida: orden teórico entre sí
        const pa = medido(a.id) as number;
        const pb = medido(b.id) as number;
        return pa - pb || lentoAntesQue(a.id, b.id);
      })
      .map((x) => x.id);
  } catch {
    return [...cadena];
  }
}

/** Pasos del turno: trozos por frase, y qué se sintetiza por adelantado. */
export interface PlanTurno {
  trozos: string[];
  /** Índices que se sintetizan por adelantado (todos menos el último). */
  prefetch: number[];
}

/**
 * planificarTurno — parte el texto POR FRASES (puntuación fuerte): la primera
 * frase sale sola para empezar a sonar mientras el modelo de lenguaje sigue
 * escribiendo, y cada frase demasiado larga se trocea aún más con
 * `trocearTexto`. Pura.
 */
export function planificarTurno(texto: string, maxTrozo = 160): PlanTurno {
  const frases = (texto || "").split(/(?<=[.!?;:…])\s+/).map((f) => f.trim()).filter(Boolean);
  const trozos: string[] = [];
  for (const f of frases) {
    if (f.length <= maxTrozo) trozos.push(f);
    else trozos.push(...trocearTexto(f, maxTrozo));
  }
  const prefetch = trozos.slice(0, Math.max(0, trozos.length - 1)).map((_, i) => i);
  return { trozos, prefetch };
}

// ── Capas de la plática ──────────────────────────────────────────────────────

/** Dónde puede salir la voz, en orden de cercanía (contrato §2.4). */
export type CapaVoz = "aparato" | "neurona-remota" | "malla" | "spaces" | "sistema";

export const CAPAS_ORDEN: readonly CapaVoz[] = [
  "aparato",
  "neurona-remota",
  "malla",
  "spaces",
  "sistema",
];

/** Una capa con su orden teórico de motores y sus medidas en ESTA neurona. */
export interface CapaPlaniada {
  capa: CapaVoz;
  /** Orden teórico de la capa (lo que esa capa tiene disponible ahora). */
  cadena: string[];
  medidas: readonly MedidaMotor[];
  /** true si algo medido salió (o nada está medido) dentro del presupuesto. */
  dentroDelPresupuesto: boolean;
}

/**
 * ordenarCapas — aparato › otra neurona de la cuenta en la red local › malla del
 * grupo › Spaces › voz del sistema. Cada capa se reordena por latencia medida y
 * las que NO llegan al presupuesto (medidas completas y todas lentas) pasan al
 * FINAL, para que la de detrás las reciba sin silencios (§2.4). Pura.
 */
export function ordenarCapas(
  capas: readonly CapaPlaniada[],
  presupuestoMs: number = PRESUPUESTO_PRIMER_SONIDO_MS,
): CapaPlaniada[] {
  try {
    const porCapa = capas.map((c) => ({
      ...c,
      cadena: reordenarPorLatenciaMedida(c.cadena, c.medidas, "conversacion", presupuestoMs),
      dentroDelPresupuesto:
        !c.medidas.length ||
        c.medidas.some((m) => typeof m.primerSonidoMs === "number" && m.primerSonidoMs <= presupuestoMs),
    }));
    const rango = (c: CapaPlaniada): number => {
      const base = CAPAS_ORDEN.indexOf(c.capa);
      return (base < 0 ? CAPAS_ORDEN.length : base) + (c.dentroDelPresupuesto ? 0 : CAPAS_ORDEN.length);
    };
    return porCapa.sort((a, b) => rango(a) - rango(b));
  } catch {
    return [...capas];
  }
}

// ── Cronograma del turno (motores simulados) ─────────────────────────────────

/**
 * cronograma — cola de un turno con la síntesis por trozos: el trozo 0 entra a
 * sintetizar en t=0 y suena al llegar (`esperaMs` del motor); cada trozo
 * siguiente entra a sintetizar cuando empieza a sonar el anterior (mientras
 * suena la anterior) y queda listo `esperaMs` después — si su síntesis termina
 * más tarde que el audio del anterior, ese hueco es silencio. Recibe duraciones
 * de audio (ms) y la espera del motor (ms), NÚMEROS: así se prueba con relojes y
 * motores simulados, sin red ni discos. Pura.
 */
export interface SegmentoCrono {
  trozo: number;
  /** ms en que empieza a sonar (desde t=0 del turno). */
  suenaMs: number;
  /** ms en que se acaba el audio de este trozo. */
  acabaMs: number;
  /** Hueco de silencio justo antes de este trozo (0 para el primero). */
  silencioAntesMs: number;
}

export interface Cronograma {
  pasos: SegmentoCrono[];
  primerSonidoMs: number;
  silencioMaximoMs: number;
  /** Primer sonido dentro del presupuesto (≤ 0,8 s en conversación). */
  dentroDelPresupuesto: boolean;
  /** Ningún silencio entre trozos supera el presupuesto. */
  sinSilencios: boolean;
  totalMs: number;
}

export function cronograma(
  duracionAudioMs: readonly number[],
  esperaMs: number,
  presupuestoMs: number = PRESUPUESTO_PRIMER_SONIDO_MS,
): Cronograma {
  const pasos: SegmentoCrono[] = [];
  let libreMs = 0; // el altavoz queda libre aquí
  for (let i = 0; i < duracionAudioMs.length; i++) {
    const listoMs = esperaMs * (i + 1);
    const suena = Math.max(listoMs, libreMs);
    const acaba = suena + Math.max(0, duracionAudioMs[i] ?? 0);
    pasos.push({ trozo: i, suenaMs: suena, acabaMs: acaba, silencioAntesMs: Math.max(0, suena - libreMs) });
    // El siguiente trozo entra a sintetizar mientras suena este: con la espera
    // del motor por trozo, su audio está listo `esperaMs·(i+1)` desde el turno.
    libreMs = acaba;
  }
  const silencios = pasos.slice(1).map((p) => p.silencioAntesMs);
  const maximo = silencios.length ? Math.max(...silencios) : 0;
  const primer = pasos.length ? pasos[0].suenaMs : esperaMs;
  return {
    pasos,
    primerSonidoMs: primer,
    silencioMaximoMs: maximo,
    dentroDelPresupuesto: primer <= presupuestoMs,
    sinSilencios: maximo <= presupuestoMs,
    totalMs: pasos.length ? pasos[pasos.length - 1].acabaMs : 0,
  };
}

// ── Interrupción ─────────────────────────────────────────────────────────────

/** El corte se juzga con relojes en ms; la voz real corta `stopConfiguredEngine`. */
export interface Interrupcion {
  /** ms que pasaron de «se le oyó la voz» a «se calló la nuestra». */
  msHastaCortar: number;
  /** true si cortó dentro del límite (< 100 ms). */
  rapida: boolean;
}

/**
 * evaluarInterrupcion — la persona empieza a hablar: la voz debe callarse AL
 * INSTANTE y quedar el canal libre para escuchar (§2.3). Con relojes en ms
 * (detection → cut) dice si el corte fue rápido. Pura.
 */
export function evaluarInterrupcion(deteccionMs: number, corteMs: number): Interrupcion {
  const ms = Math.max(0, Math.round(corteMs - deteccionMs));
  return { msHastaCortar: ms, rapida: ms < LIMITE_INTERRUPCION_MS };
}
