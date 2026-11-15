/**
 * canal-rapido-ajuste — el ajuste «Canal rápido Bluetooth (experimental)» (BLE1109B · 2026-11-09).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin DOM; el almacenamiento y la app nativa se inyectan). Contrato: `architecture/bluetooth-directo.md` §15.
 *
 * Caso real del 09-11: el canal L2CAP de prueba.31 iba SIEMPRE encendido y el Bluetooth dejó de llevar nada. Desde
 * prueba.32 el canal rápido es un ajuste ENCENDIDO por defecto (prueba.31 no tenía el ajuste: no hay nada que migrar a
 * «apagado»), seguro por construcción: solo se abre tras «ligado» por GATT, hace una autoprueba de eco (3 s) antes de mover
 * tráfico y, si algo falla, el enlace sigue por GATT sin cortarse. Quien quiera, lo apaga: entonces el enlace es GATT puro.
 *
 * Verdad = la app nativa (`ble.json`, comando `ble_canal_rapido`). La web guarda un espejo con versión.
 */

export const CLAVE_CANAL_RAPIDO_BLE = "starseed.ble.canal-rapido";
/** Versión del ajuste. Antes (prueba.31) no existía: el canal estaba siempre encendido sin que nadie lo pidiera (= el defecto). */
export const VERSION_CANAL_RAPIDO_BLE = 2;

export interface AjusteCanalRapido {
  activo: boolean;
  v: number;
}

export const AJUSTE_CANAL_RAPIDO_DEFECTO: Readonly<AjusteCanalRapido> = Object.freeze({ activo: true, v: VERSION_CANAL_RAPIDO_BLE });

/** Lo guardado → el ajuste. Se respeta lo elegido a propósito (versión actual); todo lo demás, el defecto (encendido). */
export function leerAjusteCanalRapido(crudo: string | null | undefined): AjusteCanalRapido {
  if (typeof crudo !== "string" || !crudo.trim()) return { ...AJUSTE_CANAL_RAPIDO_DEFECTO };
  try {
    const o = JSON.parse(crudo) as { activo?: unknown; v?: unknown } | null;
    if (o && typeof o === "object" && o.v === VERSION_CANAL_RAPIDO_BLE && typeof o.activo === "boolean") return { activo: o.activo, v: VERSION_CANAL_RAPIDO_BLE };
  } catch {
    /* ilegible: apagado */
  }
  return { ...AJUSTE_CANAL_RAPIDO_DEFECTO };
}

export function serializarAjusteCanalRapido(activo: boolean): string {
  return JSON.stringify({ activo, v: VERSION_CANAL_RAPIDO_BLE } satisfies AjusteCanalRapido);
}

/** ¿Lo guardado es de una versión anterior (o ilegible)? Solo hace falta ponerle la versión: NUNCA cambia el valor de la persona. */
export function necesitaMigrarCanalRapido(crudo: string | null | undefined): boolean {
  if (typeof crudo !== "string" || !crudo.trim()) return false; // nada guardado: ya es el defecto
  try {
    const o = JSON.parse(crudo) as { v?: unknown } | null;
    return !(o && typeof o === "object" && o.v === VERSION_CANAL_RAPIDO_BLE);
  } catch {
    return true;
  }
}

export interface DepsAjusteCanalRapido {
  leer(): string | null;
  escribir(v: string): void;
  /** `ble_canal_rapido`: sin argumento lee, con `activo` lo guarda en la app nativa (que reinicia su Bluetooth). Devuelve el valor. */
  nativo(activo?: boolean): Promise<boolean | null>;
}

/**
 * Al arrancar: deja el espejo al día con lo que dice la app nativa (la verdad), con la versión actual. No apaga ni enciende nada
 * por sí sola. Devuelve el valor vigente en la app nativa (null: no hay app nativa o no contestó).
 */
export async function sincronizarCanalRapido(d: DepsAjusteCanalRapido): Promise<boolean | null> {
  let vigente: boolean | null = null;
  try {
    vigente = await d.nativo();
  } catch {
    vigente = null;
  }
  if (vigente === null) return null;
  try {
    d.escribir(serializarAjusteCanalRapido(vigente));
  } catch {
    /* sin almacenamiento: vale la app nativa */
  }
  return vigente;
}

/** Cambia el ajuste: primero la app nativa (la verdad), luego el espejo. */
export async function fijarCanalRapido(d: DepsAjusteCanalRapido, activo: boolean): Promise<{ ok: boolean; activo: boolean }> {
  let vigente: boolean | null = null;
  try {
    vigente = await d.nativo(activo);
  } catch {
    vigente = null;
  }
  if (vigente === null) return { ok: false, activo };
  try {
    d.escribir(serializarAjusteCanalRapido(vigente));
  } catch {
    /* sin almacenamiento */
  }
  return { ok: true, activo: vigente };
}

/* ══════════════════════════ Espejo del registro de enlaces ══════════════════════════ */

/** Líneas del registro propio que se mandan al otro lado al ligarse (las últimas). */
export const MAX_LINEAS_ESPEJO_BLE = 50;
/** Largo máximo de cada línea espejada. */
export const MAX_LARGO_LINEA_ESPEJO_BLE = 240;
/** Como mucho un espejo por enlace cada tanto (un enlace que se liga y cae no llena el archivo del otro). */
export const ESPERA_ESPEJO_REGISTRO_BLE_MS = 30_000;
/** Tope del texto de un espejo (cabe de sobra en los 16 KiB de un mensaje, con el cifrado y la trama). */
const MAX_TEXTO_ESPEJO = 9_000;

export const T_ESPEJO_REGISTRO_BLE = "nl.reg";

/** (BLE1115C) El resumen de una llamada y sus muestras compactas (`ble_muestras.rs`) son más largos que una línea normal. */
export const RE_LINEA_DE_LLAMADA_BLE = /\bnativa · ble-enlace-(?:llamada|muestras)\b/;
export const MAX_LARGO_LINEA_LLAMADA_BLE = 480;

function lineaLimpia(s: unknown): string {
  const t = String(s ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim();
  return t.slice(0, RE_LINEA_DE_LLAMADA_BLE.test(t.slice(0, 160)) ? MAX_LARGO_LINEA_LLAMADA_BLE : MAX_LARGO_LINEA_ESPEJO_BLE);
}

/** Las últimas líneas del registro propio, limpias y dentro del tope. Puro. */
export function recortarEspejoRegistro(lineas: readonly unknown[], max = MAX_LINEAS_ESPEJO_BLE): string[] {
  const l = lineas.map(lineaLimpia).filter((x) => x.length > 0).slice(-Math.max(1, Math.min(max, MAX_LINEAS_ESPEJO_BLE)));
  let total = l.reduce((s, x) => s + x.length + 1, 0);
  while (l.length > 1 && total > MAX_TEXTO_ESPEJO) total -= (l.shift() as string).length + 1;
  return l;
}

/**
 * (BLE1115C) Parte las líneas nuevas en las normales y las de una llamada (resumen y muestras de `ble_muestras.rs`): las normales
 * siguen con su tope de bytes y de líneas, y las de la llamada tienen el suyo, aparte, para que un resumen no lo empujen fuera
 * veinte líneas de otra cosa (el 15-11 la medida de una llamada de 2 min no llegó entera). Se queda con lo más nuevo de cada
 * clase (las muestras van antes que el resumen: el resumen es lo último que cae). Puro.
 */
export const MAX_BYTES_LLAMADA_ESPEJO_BLE = 4_200;
export function repartirEspejoConLlamada(normales: readonly string[], deLlamada: readonly string[], maxBytesNormales: number): string[] {
  const topar = (l: string[], max: number) => {
    let total = l.reduce((s, x) => s + x.length + 1, 0);
    while (l.length > 1 && total > max) total -= (l.shift() as string).length + 1;
    return l;
  };
  const n = topar(recortarEspejoRegistro(normales), maxBytesNormales);
  const c = topar(recortarEspejoRegistro(deLlamada), MAX_BYTES_LLAMADA_ESPEJO_BLE);
  return [...n, ...c];
}

/** El mensaje que lleva el espejo. */
export function textoEspejoRegistro(lineas: readonly string[]): string {
  return JSON.stringify({ t: T_ESPEJO_REGISTRO_BLE, l: lineas });
}

/** Lo que llega: las líneas del otro lado, saneadas, o null si no es un espejo válido. */
export function leerEspejoRegistro(cuerpo: string): string[] | null {
  if (typeof cuerpo !== "string" || !cuerpo.startsWith(`{"t":"${T_ESPEJO_REGISTRO_BLE}"`) || cuerpo.length > 16 * 1024) return null;
  try {
    const o = JSON.parse(cuerpo) as { t?: unknown; l?: unknown };
    if (o.t !== T_ESPEJO_REGISTRO_BLE || !Array.isArray(o.l)) return null;
    const l = recortarEspejoRegistro(o.l.filter((x): x is string => typeof x === "string"));
    return l.length ? l : null;
  } catch {
    return null;
  }
}
