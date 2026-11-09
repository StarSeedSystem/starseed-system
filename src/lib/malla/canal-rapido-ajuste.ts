/**
 * canal-rapido-ajuste — el ajuste «Canal rápido Bluetooth (experimental)» (BLE1109B · 2026-11-09).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin DOM; el almacenamiento y la app nativa se inyectan). Contrato: `architecture/bluetooth-directo.md` §15.
 *
 * Caso real del 09-11: el canal L2CAP de prueba.31 iba SIEMPRE encendido y el Bluetooth dejó de llevar nada. Desde
 * prueba.32 el canal rápido es un ajuste APAGADO por defecto: sin él, el enlace es GATT puro, idéntico al de prueba.30
 * (la app nativa ni publica la característica PSM ni pide PHY 2M). Quien lo enciende, lo enciende a propósito.
 *
 * Verdad = la app nativa (`ble.json`, comando `ble_canal_rapido`). La web guarda un espejo con versión solo para migrar:
 * cualquier valor de una versión anterior (o sin versión) se lee como APAGADO.
 */

export const CLAVE_CANAL_RAPIDO_BLE = "starseed.ble.canal-rapido";
/** Versión del ajuste. Antes (prueba.31) no existía: el canal estaba siempre encendido sin que nadie lo pidiera. */
export const VERSION_CANAL_RAPIDO_BLE = 2;

export interface AjusteCanalRapido {
  activo: boolean;
  v: number;
}

export const AJUSTE_CANAL_RAPIDO_DEFECTO: Readonly<AjusteCanalRapido> = Object.freeze({ activo: false, v: VERSION_CANAL_RAPIDO_BLE });

/** Lo guardado → el ajuste. Solo se respeta un `activo: true` de la versión actual; todo lo demás, apagado. */
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

/** ¿Lo guardado es de una versión anterior (o ilegible) y hay que migrarlo a «apagado»? */
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
 * Al arrancar: migra lo guardado por versiones anteriores a «apagado» (también en la app nativa) y deja el espejo al día.
 * Devuelve el valor vigente en la app nativa (null: no hay app nativa o no contestó). Nunca enciende el canal por sí sola.
 */
export async function sincronizarCanalRapido(d: DepsAjusteCanalRapido): Promise<boolean | null> {
  let crudo: string | null = null;
  try {
    crudo = d.leer();
  } catch {
    crudo = null;
  }
  const migrar = necesitaMigrarCanalRapido(crudo);
  let vigente: boolean | null = null;
  try {
    vigente = await d.nativo();
  } catch {
    vigente = null;
  }
  if (vigente === null) return null;
  if (migrar && vigente) {
    try {
      vigente = (await d.nativo(false)) ?? false;
    } catch {
      /* se queda como estaba; se reintenta en el siguiente arranque */
    }
  }
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
  if (vigente === null) return { ok: false, activo: false };
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

function lineaLimpia(s: unknown): string {
  return String(s ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, MAX_LARGO_LINEA_ESPEJO_BLE);
}

/** Las últimas líneas del registro propio, limpias y dentro del tope. Puro. */
export function recortarEspejoRegistro(lineas: readonly unknown[], max = MAX_LINEAS_ESPEJO_BLE): string[] {
  const l = lineas.map(lineaLimpia).filter((x) => x.length > 0).slice(-Math.max(1, Math.min(max, MAX_LINEAS_ESPEJO_BLE)));
  let total = l.reduce((s, x) => s + x.length + 1, 0);
  while (l.length > 1 && total > MAX_TEXTO_ESPEJO) total -= (l.shift() as string).length + 1;
  return l;
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
