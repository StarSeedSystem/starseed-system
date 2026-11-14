/**
 * modelo-geo — la posición de una neurona y QUIÉN puede verla (MAP1114B).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Regla dura (Alex, 14-11), aplicada AQUÍ y no solo en la interfaz:
 *   · la posición exacta y en vivo de un aparato personal es PRIVADA por defecto: la ve su dueño y
 *     quien él autorice;
 *   · la capa pública solo muestra una zona aproximada de ≈1 km, salvo que el dueño publique el
 *     punto exacto (opción aparte, por neurona);
 *   · un nodo fijo público muestra su punto solo si su operador lo publica.
 *
 * El punto crudo (`PosicionCruda`) vive en el aparato. Lo único que sale de él es un `AnuncioPosicion`,
 * y la ÚNICA función que lo fabrica es `anuncioParaAmbito`, que mira la preferencia del dueño para ese
 * ámbito. Con la preferencia por defecto no sale nada. Un anuncio de zona NO contiene el punto.
 *
 * Puro: sin React, sin red, sin `node:*`.
 */

import { coordenadaValida, zonaAproximada, type ZonaAprox } from "./zona";

export type FuentePosicion = "gps" | "manual" | "lora";

/** Lo que el aparato sabe de su sitio. NO sale del aparato por sí solo. */
export interface PosicionCruda {
  lat: number;
  lon: number;
  precisionM?: number | null;
  /** Hora de la medida (epoch ms). */
  t: number;
  fuente: FuentePosicion;
}

export type NivelPosicion = "no" | "zona" | "exacta";

/** Preferencia del dueño, por neurona (cada aparato guarda la suya). */
export interface PreferenciaPosicion {
  /** Qué ven mis otras neuronas (la cuenta). */
  cuenta: NivelPosicion;
  /** Qué ve el radar/capa pública. «exacta» es una decisión aparte de «zona». */
  publica: NivelPosicion;
  /** Ámbitos concretos que el dueño autorizó (grupo, página…), con su nivel. */
  autorizados: Readonly<Record<string, "zona" | "exacta">>;
}

/** Privacidad primero: por defecto no sale ninguna posición del aparato. */
export const PREFERENCIA_POSICION_DEFECTO: PreferenciaPosicion = { cuenta: "no", publica: "no", autorizados: {} };

/** Quién mira. `dueno` = el propio aparato (o su dueño en su pantalla). */
export type Ambito =
  | { tipo: "dueno" }
  | { tipo: "cuenta" }
  | { tipo: "autorizado"; id: string }
  | { tipo: "publico" };

/** Lo que viaja: o el punto (con permiso explícito) o la zona. */
export type AnuncioPosicion =
  | { k: "exacta"; lat: number; lon: number; precisionM?: number; t: number }
  | { k: "zona"; zona: ZonaAprox; t: number };

export interface OpcionesAnuncio {
  /** Nodo fijo (no una neurona móvil). */
  fijo?: boolean;
  /** Un nodo fijo público solo da su punto si su operador lo publica. */
  operadorPublicaPunto?: boolean;
}

/** Nivel que la preferencia concede a un ámbito (el dueño siempre se ve a sí mismo). */
export function nivelParaAmbito(pref: PreferenciaPosicion, ambito: Ambito): NivelPosicion {
  switch (ambito.tipo) {
    case "dueno":
      return "exacta";
    case "cuenta":
      return pref.cuenta;
    case "autorizado":
      return pref.autorizados[ambito.id] ?? "no";
    case "publico":
      return pref.publica;
  }
}

/**
 * La ÚNICA puerta por la que una posición sale del aparato. `null` = no sale nada.
 * Con nivel «zona» el resultado no contiene la coordenada original.
 */
export function anuncioParaAmbito(
  cruda: PosicionCruda | null | undefined,
  pref: PreferenciaPosicion,
  ambito: Ambito,
  opciones: OpcionesAnuncio = {},
): AnuncioPosicion | null {
  if (!cruda || !coordenadaValida(cruda.lat, cruda.lon) || !Number.isFinite(cruda.t)) return null;
  let nivel = nivelParaAmbito(pref, ambito);
  if (ambito.tipo === "publico" && opciones.fijo) nivel = opciones.operadorPublicaPunto ? "exacta" : "no";
  if (nivel === "no") return null;
  if (nivel === "exacta") {
    const p = cruda.precisionM;
    return { k: "exacta", lat: cruda.lat, lon: cruda.lon, ...(typeof p === "number" && Number.isFinite(p) && p >= 0 ? { precisionM: Math.round(p) } : {}), t: cruda.t };
  }
  const zona = zonaAproximada(cruda.lat, cruda.lon);
  return zona ? { k: "zona", zona, t: cruda.t } : null;
}

/** Lee un anuncio llegado de fuera (presencia, federación) sin fiarse de su forma. */
export function leerAnuncio(x: unknown): AnuncioPosicion | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.t !== "number" || !Number.isFinite(o.t)) return null;
  if (o.k === "exacta") {
    if (!coordenadaValida(o.lat, o.lon)) return null;
    const p = o.precisionM;
    return { k: "exacta", lat: o.lat as number, lon: o.lon as number, ...(typeof p === "number" && Number.isFinite(p) && p >= 0 ? { precisionM: p } : {}), t: o.t };
  }
  if (o.k === "zona" && o.zona && typeof o.zona === "object") {
    const z = o.zona as Record<string, unknown>;
    if (!coordenadaValida(z.lat, z.lon) || typeof z.celda !== "string" || !z.celda.startsWith("z1:")) return null;
    // Se vuelve a calcular la celda desde lo que dice el anuncio y se exige que sea la misma: lo que se
    // pinta es siempre el CENTRO de una celda de la rejilla, nunca una coordenada que traiga el anuncio.
    const z2 = zonaAproximada(z.lat as number, z.lon as number);
    if (!z2 || z2.celda !== z.celda) return null;
    const centro = { ...z2, lat: Math.round(((z2.latMin + z2.latMax) / 2) * 1e6) / 1e6, lon: Math.round(((z2.lonMin + z2.lonMax) / 2) * 1e6) / 1e6 };
    return { k: "zona", zona: centro, t: o.t };
  }
  return null;
}

/** Lo que la vista dibuja de una neurona: nunca un punto inventado. */
export type PosicionVista =
  | { tipo: "exacta"; lat: number; lon: number; precisionM?: number; t: number }
  | { tipo: "zona"; zona: ZonaAprox; t: number }
  | { tipo: "desconocida"; motivo: string };

export function posicionVistaDeAnuncio(a: AnuncioPosicion | null, motivo: string): PosicionVista {
  if (!a) return { tipo: "desconocida", motivo };
  return a.k === "exacta"
    ? { tipo: "exacta", lat: a.lat, lon: a.lon, ...(a.precisionM !== undefined ? { precisionM: a.precisionM } : {}), t: a.t }
    : { tipo: "zona", zona: a.zona, t: a.t };
}

/** Coordenadas con las que se coloca una marca (centro de la zona o el punto). `null` si se desconoce. */
export function coordenadasDeVista(p: PosicionVista): { lat: number; lon: number } | null {
  if (p.tipo === "exacta") return { lat: p.lat, lon: p.lon };
  if (p.tipo === "zona") return { lat: p.zona.lat, lon: p.zona.lon };
  return null;
}

export const FRASE_NIVEL: Record<NivelPosicion, string> = {
  no: "no se comparte",
  zona: "solo una zona aproximada de ≈1 km",
  exacta: "el punto exacto",
};
