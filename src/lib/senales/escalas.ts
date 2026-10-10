/**
 * escalas — la REGLA de distancias del mapa y sus anillos honestos (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dos escalas logarítmicas, una por alcance físico:
 *   · «largo» — LoRa: 30 m–6 km (la misma del radar de siempre, `radiusFracForMeters`);
 *   · «corto» — Bluetooth y Wi-Fi: 1–300 m. Con la regla larga un BLE a 4 m caía en el
 *     mismo sitio que uno a 30 m (todo lo cercano se comprimía en el centro).
 *
 * Y una sola promesa: un anillo de distancia solo existe donde la distancia existe.
 *   · algún elemento colocado con GPS de ambos extremos → círculo COMPLETO (rumbo real);
 *   · solo distancia ESTIMADA por RF → arco limitado al sector de su antena y marcado «≈»;
 *   · sin ninguna distancia → ningún anillo.
 *
 * Puro: sin React, sin red, sin `node:*`.
 */

import {
  ANTENNA_SECTOR,
  radiusFracForMeters,
  type AntennaKind,
  type DetectedSignal,
} from "@/ai/astraura/mesh/signals";
import type { AnilloAlcance, EscalaId } from "./tipos-vivo";

export interface EscalaDef {
  id: EscalaId;
  minM: number;
  maxM: number;
  /** Distancias que se dibujan como anillo o arco cuando hay datos. */
  marcas: readonly number[];
}

export const ESCALAS: Record<EscalaId, EscalaDef> = {
  largo: { id: "largo", minM: 30, maxM: 6000, marcas: [100, 1000, 5000] },
  corto: { id: "corto", minM: 1, maxM: 300, marcas: [3, 10, 30, 100, 300] },
};

/** Qué familias miden distancia y con qué regla. Relé, cuenta y serie NO tienen distancia. */
export const ESCALA_FAMILIA: Partial<Record<AntennaKind, EscalaId>> = {
  lora: "largo",
  ble: "corto",
  ip: "corto",
};

/** Misma franja que `radiusFracForMeters`: así las dos escalas llenan el mismo disco. */
export const FRACCION_MIN = 0.16;
export const FRACCION_MAX = 0.92;

function acotar(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

/** Distancia (m) → fracción del radio del mapa, en la escala dada. Acotada a la escala. */
export function fraccionPorDistancia(metros: number, escala: EscalaId): number {
  if (escala === "largo") return radiusFracForMeters(Number.isFinite(metros) ? metros : ESCALAS.largo.minM);
  const e = ESCALAS[escala];
  const lo = Math.log10(e.minM);
  const hi = Math.log10(e.maxM);
  const m = acotar(Number.isFinite(metros) ? metros : e.minM, e.minM, e.maxM);
  return FRACCION_MIN + ((Math.log10(m) - lo) / (hi - lo)) * (FRACCION_MAX - FRACCION_MIN);
}

/** Inversa de `fraccionPorDistancia` (para leer el mapa con el dedo y para las pruebas). */
export function distanciaPorFraccion(fraccion: number, escala: EscalaId): number {
  const e = ESCALAS[escala];
  const lo = Math.log10(e.minM);
  const hi = Math.log10(e.maxM);
  const f = (acotar(fraccion, FRACCION_MIN, FRACCION_MAX) - FRACCION_MIN) / (FRACCION_MAX - FRACCION_MIN);
  return Math.pow(10, lo + f * (hi - lo));
}

/** «3 m», «120 m», «1,2 km». */
export function formatoMetros(m: number): string {
  if (!Number.isFinite(m)) return "sin dato";
  if (m >= 1000) return `${(m >= 10_000 ? Math.round(m / 1000) : Math.round(m / 100) / 10).toString().replace(".", ",")} km`;
  if (m >= 10) return `${Math.round(m)} m`;
  return `${(Math.round(m * 10) / 10).toString().replace(".", ",")} m`;
}

/**
 * Factor de error del modelo de distancia por RF. LoRa: ×1,6 con buena señal y ×2,6 con mala (el
 * que ya declara `placeByRf`). Bluetooth y Wi-Fi: el RSSI cambia mucho con paredes y cuerpos, así
 * que el modelo es más burdo (×2 a ×3). Sin calidad se supone 0,35, igual que `placeByRf`.
 */
export function factorError(antenna: AntennaKind, calidad: number | null): number {
  const q = calidad == null ? 0.35 : acotar(calidad, 0, 1);
  return (antenna === "lora" ? 1.6 : 2.0) + (1 - q);
}

/** Halo de precisión (fracción del radio) de una distancia estimada: la mitad del rango ×factor. */
export function haloDeEstimacion(metros: number, escala: EscalaId, factor: number): number {
  const fuera = fraccionPorDistancia(metros * factor, escala);
  const dentro = fraccionPorDistancia(metros / factor, escala);
  return Math.max(0.035, (fuera - dentro) / 2);
}

/**
 * Coloca en la escala CORTA lo que `placeByRf` dejó en la larga (Bluetooth y Wi-Fi por RSSI): la
 * distancia dibujada y la distancia escrita deben decir lo mismo. Solo toca `mode === "rf"` de
 * familias con escala corta; todo lo demás vuelve idéntico (misma referencia). No muta.
 */
export function reubicar(s: DetectedSignal): DetectedSignal {
  const p = s.placement;
  if (!p || p.mode !== "rf" || ESCALA_FAMILIA[s.antenna] !== "corto") return s;
  if (typeof p.distanceM !== "number" || !Number.isFinite(p.distanceM)) return s;
  const d = Math.max(ESCALAS.corto.minM, p.distanceM);
  const f = factorError(s.antenna, s.quality);
  return {
    ...s,
    placement: {
      ...p,
      distanceM: d,
      radiusFrac: fraccionPorDistancia(d, "corto"),
      accuracyFrac: haloDeEstimacion(d, "corto", f),
      accuracyM: Math.round(d * (f - 1)),
      detail: `${p.detail.replace(/\s*±\s*50\s*%/, "").replace(/\s*El rumbo es desconocido.*$/i, "").replace(/\s*Paredes y cuerpos.*$/i, "").trim()} Rango del modelo: entre ${formatoMetros(d / f)} y ${formatoMetros(d * f)}. El rumbo es desconocido: se sitúa en el sector de su antena.`,
    },
  };
}

/* ── Anillos ───────────────────────────────────────────────────────────────── */

/** Marcas de una escala hasta la primera que alcanza `hasta` (la que "cierra" lo observado). */
function marcasHasta(escala: EscalaId, hasta: number): number[] {
  const out: number[] = [];
  for (const m of ESCALAS[escala].marcas) {
    out.push(m);
    if (m >= hasta) break;
  }
  return out;
}

export function anillosDeAlcance(senales: readonly DetectedSignal[]): AnilloAlcance[] {
  const anillos: AnilloAlcance[] = [];
  const maxPorEscalaGps = new Map<EscalaId, number>();
  const rfPorFamilia = new Map<AntennaKind, number>();
  for (const s of senales) {
    const escala = ESCALA_FAMILIA[s.antenna];
    const d = s.placement?.distanceM;
    if (!escala || typeof d !== "number" || !Number.isFinite(d)) continue;
    if (s.placement.mode === "gps") maxPorEscalaGps.set(escala, Math.max(maxPorEscalaGps.get(escala) ?? 0, d));
    else if (s.placement.mode === "rf") rfPorFamilia.set(s.antenna, Math.max(rfPorFamilia.get(s.antenna) ?? 0, d));
  }
  for (const [escala, max] of maxPorEscalaGps) {
    for (const m of marcasHasta(escala, max)) {
      anillos.push({
        id: `gps:${escala}:${m}`, escala, metros: m, etiqueta: formatoMetros(m),
        fraccion: fraccionPorDistancia(m, escala), real: true, familia: null, desdeRad: null, hastaRad: null,
      });
    }
  }
  for (const [familia, max] of rfPorFamilia) {
    const escala = ESCALA_FAMILIA[familia]!;
    if (maxPorEscalaGps.has(escala)) continue; // ya hay círculo completo en esa escala
    const sec = ANTENNA_SECTOR[familia];
    for (const m of marcasHasta(escala, max)) {
      anillos.push({
        id: `rf:${familia}:${m}`, escala, metros: m, etiqueta: `≈${formatoMetros(m)}`,
        fraccion: fraccionPorDistancia(m, escala), real: false, familia,
        desdeRad: sec.center - sec.half, hastaRad: sec.center + sec.half,
      });
    }
  }
  return anillos;
}
