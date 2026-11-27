/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Sala de sonido · RELOJ COMÚN (NFC1126K · contrato §11).
 * ---------------------------------------------------------------------------
 * Varias neuronas reproducen la misma cola. Para que suenen juntas no basta
 * con enviar «play»: cada aparato tiene su reloj y su deriva. Aquí se mide el
 * desfase remoto-local (estilo NTP), se traduce una posición de un reloj al
 * otro y se decide cómo corregir la deriva SIN cortar el audio: muelles de
 * velocidad por debajo de 50 ms y salto seco solo cuando ya no hay remedio.
 *
 * Módulo PURO: sin red, sin disco, sin `Date.now()`. Los relojes se simulan
 * en las pruebas y la malla solo aporta las cuatro marcas de cada muestra.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Una medición de ida y vuelta entre dos relojes (estilo NTP). */
export interface MuestraReloj {
  /** ms del reloj local al enviar la petición. */
  t0: number;
  /** ms del reloj remoto cuando recibió. */
  t1: number;
  /** ms del reloj remoto al responder. */
  t2: number;
  /** ms del reloj local al recibir la respuesta. */
  t3: number;
}

/** Desfase estimado y su incertidumbre. */
export interface DesfaseReloj {
  /** remoto − local (positivo = el remoto va por delante). */
  desfaseMs: number;
  /** ida y vuelta descontando el tiempo de proceso remoto. */
  idaVueltaMs: number;
  /** error máximo razonable: media ida y vuelta. */
  errorMs: number;
}

/** Objetivo del contrato §11: por debajo de 50 ms no se oye el desfase. */
export const OBJETIVO_DESFASE_MS = 50;

/**
 * Calcula desfase y error a partir de las cuatro marcas.
 * `t1 − t0` mide ida + desfase; `t2 − t3` mide desfase − vuelta. La media
 * cancela el tiempo de proceso del remoto y reparte en partes iguales la
 * asimetría de la red, que queda acotada por la media ida y vuelta.
 */
export function medirDesfase(m: MuestraReloj): DesfaseReloj {
  const desfaseMs = ((m.t1 - m.t0) + (m.t2 - m.t3)) / 2;
  const idaVueltaMs = (m.t3 - m.t0) - (m.t2 - m.t1);
  return { desfaseMs, idaVueltaMs, errorMs: Math.max(0, idaVueltaMs) / 2 };
}

/** De varias muestras, se queda con la de menor ida y vuelta (la más fiable). */
export function elegirMuestra(muestras: readonly MuestraReloj[]): DesfaseReloj | null {
  if (muestras.length === 0) return null;
  let mejor = medirDesfase(muestras[0]);
  for (const m of muestras.slice(1)) {
    const d = medirDesfase(m);
    if (d.idaVueltaMs < mejor.idaVueltaMs) mejor = d;
  }
  return mejor;
}

/** Convierte una hora del reloj remoto a la hora local. */
export function horaRemotaALocal(horaRemotaMs: number, desfaseMs: number): number {
  return horaRemotaMs - desfaseMs;
}

/** Convierte una hora local a la hora del reloj remoto. */
export function horaLocalARemota(horaLocalMs: number, desfaseMs: number): number {
  return horaLocalMs + desfaseMs;
}

/** Qué hacer con la reproducción para acercarla al reloj común. */
export type AccionSincronia = "mantener" | "adelantar" | "atrasar" | "saltar";

/** Corrección de deriva con su ajuste y la velocidad sugerida. */
export interface CorreccionDeriva {
  accion: AccionSincronia;
  /** ms que separan la posición real de la objetivo (negativo = atrasar). */
  ajusteMs: number;
  /** velocidad de reproducción sugerida (1 = normal). */
  velocidad: number;
}

/** Zona muerta, salto seco y ventana para corregir con velocidad. */
export interface UmbralesDeriva {
  toleranciaMs: number;
  saltoMs: number;
  ventanaMs: number;
  factorMaximo: number;
}

/** Valores por defecto: ±15 ms se ignora; 50 ms o más, salto. */
export const UMBRALES_DERIVA: UmbralesDeriva = {
  toleranciaMs: 15,
  saltoMs: OBJETIVO_DESFASE_MS,
  ventanaMs: 2_000,
  factorMaximo: 0.05,
};

/**
 * Decide cómo corregir la deriva entre lo que suena y el reloj común.
 *
 * `delta = real − objetivo`; positivo significa que vamos por delante. Dentro
 * de la tolerancia no se toca nada (evita microajustes audibles). Entre la
 * tolerancia y el objetivo se corrige con velocidad: la ventana elegida hace
 * que, tras `ventanaMs`, la posición real alcance exactamente la objetivo. A
 * partir de 50 ms se salta en seco, porque estirar más la velocidad sí se oye.
 */
export function corregirDeriva(
  posicionRealMs: number,
  posicionObjetivoMs: number,
  umbrales: Partial<UmbralesDeriva> = {},
): CorreccionDeriva {
  const u = { ...UMBRALES_DERIVA, ...umbrales };
  const delta = posicionRealMs - posicionObjetivoMs;
  const distancia = Math.abs(delta);
  if (distancia <= u.toleranciaMs) return { accion: "mantener", ajusteMs: 0, velocidad: 1 };
  if (distancia >= u.saltoMs) return { accion: "saltar", ajusteMs: -delta, velocidad: 1 };
  const proporcion = Math.max(-u.factorMaximo, Math.min(u.factorMaximo, delta / u.ventanaMs));
  return {
    accion: delta > 0 ? "atrasar" : "adelantar",
    ajusteMs: -delta,
    velocidad: 1 - proporcion,
  };
}
