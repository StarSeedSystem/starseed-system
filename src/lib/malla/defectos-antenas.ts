/*
 * defectos-antenas — antenas ENCENDIDAS por defecto en las apps nativas, con migración (PER1108A, 2026-11-08).
 * Contrato: architecture/red-sin-dependencias.md §4 y la regla «toda mejora de defaults DEBE migrar las configs
 * persistidas» (architecture/ de propagación de actualizaciones). MÓDULO PURO.
 *
 * Qué queda encendido de fábrica en las apps nativas: Bluetooth directo, Wi-Fi directo, faro de la red local
 * (LAN beacon) y malla local. Los que ya lo estaban en Rust (Bluetooth: `PreferenciaBle.activo = true`; faro:
 * `faro_apagado = false`) no cambian; lo nuevo es:
 *  · Wi-Fi directo: «Automático» en Android si su radio no es única (Android ↔ Android se enlazan solos sin
 *    soltar la Wi-Fi de casa) y «Preguntar» en todo lo demás: un Mac deja su Wi-Fi de casa mientras dura el
 *    enlace, así que ahí se pregunta siempre. Solo es el DEFECTO: una elección guardada manda siempre.
 *  · Migración (una vez por versión): quien nunca tocó un interruptor recibe el defecto nuevo; quien tocó
 *    uno (marcado en `explicitos`) conserva su elección. Un apagado ANTERIOR a esta migración sin marca solo
 *    puede venir de la interfaz (Bluetooth: el botón «Apagar»; Wi-Fi: el selector), así que se respeta y se
 *    marca; el faro no tenía ningún interruptor, así que un `faro_apagado` sin marca no fue decisión de nadie.
 */

import type { AjusteWifiDirecto } from "./enlace-wifi-directo";

export type AntenaAjustable = "bluetooth" | "wifi" | "faro";

export const CLAVE_DEFECTOS_ANTENAS = "starseed.antenas.defectos.v1";
/** Sube cuando cambia un defecto (y hay que revisar lo ya guardado). */
export const VERSION_DEFECTOS_ANTENAS = 1;

export interface MarcaDefectos {
  version: number;
  /** Interruptores que la persona tocó a propósito: la migración no los cambia nunca. */
  explicitos: AntenaAjustable[];
}

export const MARCA_VACIA: MarcaDefectos = { version: 0, explicitos: [] };

const ANTENAS: readonly string[] = ["bluetooth", "wifi", "faro"];

export function leerMarca(raw: string | null | undefined): MarcaDefectos {
  if (!raw) return MARCA_VACIA;
  try {
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== "object") return MARCA_VACIA;
    const m = o as { version?: unknown; explicitos?: unknown };
    const explicitos = Array.isArray(m.explicitos) ? (Array.from(new Set(m.explicitos.filter((x): x is AntenaAjustable => typeof x === "string" && ANTENAS.includes(x)))) as AntenaAjustable[]) : [];
    const version = typeof m.version === "number" && Number.isFinite(m.version) && m.version >= 0 ? Math.floor(m.version) : 0;
    return { version, explicitos };
  } catch {
    return MARCA_VACIA;
  }
}

export function serializarMarca(m: MarcaDefectos): string {
  return JSON.stringify(m);
}

/** La persona tocó el interruptor de `antena`: desde ahora su elección manda. */
export function marcarExplicito(m: MarcaDefectos, antena: AntenaAjustable): MarcaDefectos {
  return m.explicitos.includes(antena) ? m : { ...m, explicitos: [...m.explicitos, antena] };
}

/** Defecto del Wi-Fi directo según lo que puede esta neurona. Pura. */
export function ajusteWifiPorDefecto(cap: { plataforma?: string; radioUnica?: boolean } | null | undefined): AjusteWifiDirecto {
  return cap?.plataforma === "android" && cap.radioUnica !== true ? "automatico" : "preguntar";
}

/** Lo que hay ahora en este aparato (null: no se pudo leer). */
export interface SituacionAntenas {
  /** `PreferenciaBle.activo` (null: sin radio Bluetooth o no se pudo leer). */
  bluetoothActivo: boolean | null;
  /** `ConfigAntenas.faro_apagado` (null: no se pudo leer la config). */
  faroApagado: boolean | null;
  /** Lo guardado del selector de Wi-Fi directo (null: la persona nunca lo tocó). */
  wifiGuardado: string | null;
}

export interface PlanDefectos {
  /** Hay que escribir `faro_apagado = false` en la config de la app. */
  encenderFaro: boolean;
  /** La marca nueva (null: no cambia nada, no se escribe). */
  marca: MarcaDefectos | null;
}

/** Qué hay que hacer para llevar este aparato a los defectos de ahora. Pura. */
export function planDefectos(marca: MarcaDefectos, s: SituacionAntenas): PlanDefectos {
  if (marca.version >= VERSION_DEFECTOS_ANTENAS) return { encenderFaro: false, marca: null };
  let nueva: MarcaDefectos = { ...marca, version: VERSION_DEFECTOS_ANTENAS };
  // Un apagado anterior a esta migración solo pudo salir de la interfaz: es una elección.
  if (s.bluetoothActivo === false) nueva = marcarExplicito(nueva, "bluetooth");
  if (s.wifiGuardado !== null) nueva = marcarExplicito(nueva, "wifi");
  const encenderFaro = s.faroApagado === true && !nueva.explicitos.includes("faro");
  return { encenderFaro, marca: nueva };
}
