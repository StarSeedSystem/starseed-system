/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Sala de sonido · MEZCLA DE FUENTES (NFC1126K · §11).
 * ---------------------------------------------------------------------------
 * Varias neuronas ponen audio encima. Cada fuente lleva su nivel, su
 * ecualizador y su limitador; la sala elige entre mezcla (todas suenan) o
 * turnos (una cada vez). Aquí se decide la ganancia efectiva y se traducen
 * los canales a parámetros de Web Audio (GainNode, BiquadFilterNode y
 * DynamicsCompressorNode). La proporción áurea fija el Q de las bandas y los
 * cortes en pasos de Fibonacci, como pide `memory/diseno/armonia.md`.
 *
 * Módulo PURO: no crea `AudioContext`; solo calcula números para que el
 * cableado del navegador los aplique. Sin red, sin disco, sin reloj.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Cómo suenan varias fuentes a la vez. */
export type ModoMezcla = "mezcla" | "turnos";

/** Una banda del ecualizador paramétrico. */
export interface BandaEcualizador {
  frecuencia: number;
  gananciaDb: number;
}

/** Limitador por fuente, con tiempos en ms para poder probarlo sin navegador. */
export interface Limitador {
  umbralDb: number;
  ratio: number;
  ataqueMs: number;
  liberacionMs: number;
}

/** Un canal de mezcla: una fuente con su nivel y su cadena. */
export interface CanalMezcla {
  fuenteId: string;
  nivelDb: number;
  activo: boolean;
  bandas: BandaEcualizador[];
  limitador: Limitador;
}

/** La mezcla completa de la sala. */
export interface MezclaSala {
  modo: ModoMezcla;
  canales: CanalMezcla[];
  turnoDe: string | null;
}

/** Proporción áurea: ancho de banda musical y estable, no un valor inventado. */
export const PROPORCION_AUREA = 1.618033988749895;

/** Por debajo de −60 dB se considera silencio y la ganancia es exactamente 0. */
export const SILENCIO_DB = -60;

/** Bandas por defecto: cinco pasos de Fibonacci que cubren graves, medios y agudos. */
export const BANDAS_POR_DEFECTO: readonly BandaEcualizador[] = [89, 233, 610, 1597, 4181].map(
  (frecuencia) => ({ frecuencia, gananciaDb: 0 }),
);

/** Opciones al crear un canal. */
export interface OpcionesCanal {
  nivelDb?: number;
  activo?: boolean;
  bandas?: BandaEcualizador[];
  limitador?: Limitador;
}

export function crearCanal(fuenteId: string, opciones: OpcionesCanal = {}): CanalMezcla {
  return {
    fuenteId,
    nivelDb: opciones.nivelDb ?? 0,
    activo: opciones.activo ?? true,
    bandas: (opciones.bandas ?? BANDAS_POR_DEFECTO).map((b) => ({ ...b })),
    limitador: opciones.limitador ?? { umbralDb: -3, ratio: 12, ataqueMs: 5, liberacionMs: 250 },
  };
}

/** Nivel en dB → ganancia lineal (0 en silencio). */
export function gananciaLineal(nivelDb: number): number {
  if (nivelDb <= SILENCIO_DB) return 0;
  return 10 ** (nivelDb / 20);
}

/** Ganancia lineal → nivel en dB, con suelo en el silencio. */
export function dbDesdeGanancia(ganancia: number): number {
  if (ganancia <= 0) return SILENCIO_DB;
  return Math.max(SILENCIO_DB, 20 * Math.log10(ganancia));
}

/** Ganancia que de verdad se aplica: apagado, turno o mezcla. */
export function gananciaEfectiva(canal: CanalMezcla, mezcla: Pick<MezclaSala, "modo" | "turnoDe">): number {
  if (!canal.activo) return 0;
  if (mezcla.modo === "turnos" && canal.fuenteId !== mezcla.turnoDe) return 0;
  return gananciaLineal(canal.nivelDb);
}

/** Reducción estática de pico según la curva de compresión. */
export interface ResultadoLimitador {
  reduccionDb: number;
  picoSalidaDb: number;
  atacando: boolean;
}

export function limitarPico(picoDb: number, limitador: Limitador): ResultadoLimitador {
  if (picoDb <= limitador.umbralDb) return { reduccionDb: 0, picoSalidaDb: picoDb, atacando: false };
  const ratio = Math.max(1, limitador.ratio);
  const reduccionDb = -(picoDb - limitador.umbralDb) * (1 - 1 / ratio);
  return { reduccionDb, picoSalidaDb: picoDb + reduccionDb, atacando: true };
}

/** Parámetros listos para los nodos de Web Audio (segundos, no ms). */
export interface ParametrosWebAudio {
  ganancia: number;
  bandas: { type: "peaking"; frequency: number; gain: number; Q: number }[];
  compresor: { threshold: number; knee: number; ratio: number; attack: number; release: number };
}

export function parametrosWebAudio(canal: CanalMezcla): ParametrosWebAudio {
  return {
    ganancia: gananciaLineal(canal.nivelDb),
    bandas: canal.bandas.map((b) => ({
      type: "peaking",
      frequency: b.frecuencia,
      gain: b.gananciaDb,
      Q: PROPORCION_AUREA,
    })),
    compresor: {
      threshold: canal.limitador.umbralDb,
      knee: 0,
      ratio: canal.limitador.ratio,
      attack: canal.limitador.ataqueMs / 1_000,
      release: canal.limitador.liberacionMs / 1_000,
    },
  };
}

/** Canales resueltos y ganancia maestra para que la suma no sature. */
export interface MezclaResuelta {
  canales: { fuenteId: string; ganancia: number; bandas: BandaEcualizador[]; limitador: Limitador }[];
  gananciaMaestra: number;
}

export function resolverMezcla(mezcla: MezclaSala): MezclaResuelta {
  const canales = mezcla.canales.map((canal) => ({
    fuenteId: canal.fuenteId,
    ganancia: gananciaEfectiva(canal, mezcla),
    bandas: canal.bandas.map((b) => ({ ...b })),
    limitador: { ...canal.limitador },
  }));
  const sumaDeCuadrados = canales.reduce((total, c) => total + c.ganancia ** 2, 0);
  return {
    canales,
    gananciaMaestra: sumaDeCuadrados > 1 ? 1 / Math.sqrt(sumaDeCuadrados) : 1,
  };
}

/** Rota el turno al siguiente canal activo; los apagados se saltan. */
export function siguienteTurno(mezcla: MezclaSala): MezclaSala {
  const activos = mezcla.canales.filter((c) => c.activo).map((c) => c.fuenteId);
  if (activos.length === 0) return { ...mezcla, turnoDe: null };
  const actual = mezcla.turnoDe === null ? -1 : activos.indexOf(mezcla.turnoDe);
  return { ...mezcla, turnoDe: activos[(actual + 1) % activos.length] };
}
