// Almacén de directivas de automejora Meta^n por capa (MTN1027C ·
// `architecture/automejora-meta-n.md` §3–§4). Cliente puro: sin `node:*`, red ni claves.

import type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

/** Clave de localStorage de las directivas por capa (viaja con la cuenta). */
export const DIRECTIVAS_KEY = "starseed.capas.directivas.v1";

/** Evento emitido cuando se actualizan las directivas de una capa. */
export const DIRECTIVAS_EVENT = "starseed:capas-directivas";

/** `Record<capa, ArchivoDirectivas>`: todo lo guardado, por capa. */
export type MapaDirectivas = Record<string, ArchivoDirectivas>;

const ESTADOS = ["activa", "propuesta", "anterior", "retirada"] as const;

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Sanea una directiva del historial: los valores desconocidos se caen, nunca explotan. */
function normalizarDirectiva(v: unknown): DirectivaCapa | null {
  if (!esObjeto(v)) return null;
  const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  if (
    typeof v.version !== "number" || !Number.isFinite(v.version) ||
    typeof v.texto !== "string" || typeof v.fecha !== "string" || typeof v.origen !== "string" ||
    !ESTADOS.includes(v.estado as (typeof ESTADOS)[number])
  ) return null;
  const d: DirectivaCapa = {
    capa: typeof v.capa === "string" ? v.capa : "",
    version: v.version,
    texto: v.texto,
    sha256: typeof v.sha256 === "string" ? v.sha256 : "",
    acierto: num(v.acierto),
    base: num(v.base),
    n: num(v.n),
    fecha: v.fecha,
    origen: v.origen,
    estado: v.estado as DirectivaCapa["estado"],
  };
  if (typeof v.motivo === "string") d.motivo = v.motivo;
  return d;
}

/** Sanea un archivo de directivas de una capa; versión ajena o capa vacía → null. */
export function normalizarArchivoDirectivas(valor: unknown): ArchivoDirectivas | null {
  if (!esObjeto(valor) || valor.v !== 1 || typeof valor.capa !== "string" || !valor.capa) return null;
  const historial = (Array.isArray(valor.historial) ? valor.historial : [])
    .map(normalizarDirectiva)
    .filter((d): d is DirectivaCapa => d !== null);
  return {
    v: 1, capa: valor.capa, historial,
    activa: typeof valor.activa === "number" && Number.isFinite(valor.activa) ? valor.activa : null,
  };
}

/** Sanea el registro entero (`Record<capa, ArchivoDirectivas>`) tal como baja de la cuenta. */
export function normalizarRegistroDirectivas(valor: unknown): MapaDirectivas {
  if (!esObjeto(valor)) return {};
  const registro: MapaDirectivas = {};
  for (const [capa, archivo] of Object.entries(valor)) {
    const saneado = normalizarArchivoDirectivas(archivo);
    if (saneado) registro[capa] = saneado;
  }
  return registro;
}

const conAlmacen = <T>(si: (ls: Storage) => T, sino: T): T => {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? si(window.localStorage)
      : sino;
  } catch {
    return sino;
  }
};

const mapaCompleto = (): MapaDirectivas =>
  conAlmacen((ls) => {
    const mapa: MapaDirectivas = {};
    try {
      const raw = ls.getItem(DIRECTIVAS_KEY);
      if (!raw) return mapa;
      const parsed: unknown = JSON.parse(raw);
      return normalizarRegistroDirectivas(parsed);
    } catch {
      // JSON roto o almacenamiento sin permiso: se sigue sin dato.
    }
    return mapa;
  }, {});

/** Lee el mapa completo de capas, o el archivo de una capa concreta. */
export function leerDirectivas(): MapaDirectivas;
export function leerDirectivas(capa: string): ArchivoDirectivas | null;
export function leerDirectivas(capa?: string): MapaDirectivas | ArchivoDirectivas | null {
  const mapa = mapaCompleto();
  return capa === undefined ? mapa : mapa[capa] ?? null;
}

/**
 * Puerta de llegada (MTN1027C): un archivo solo entra si su versión activa es
 * MÁS NUEVA que la actual, o si con la misma activa cambió el historial
 * (propuesta nueva, retiro, vuelta atrás). Un gemelo idéntico o una versión
 * vieja no toca la pestaña que ya lo tiene.
 */
export function debeGuardarDirectivas(
  actual: ArchivoDirectivas | undefined,
  nuevo: ArchivoDirectivas | null,
): boolean {
  if (!nuevo) return false;
  if (!actual) return true;
  const activaMasNueva =
    nuevo.activa !== null && (actual.activa === null || nuevo.activa > actual.activa);
  // El historial viaja saneado en ambos lados: basta compararlo entero en JSON.
  return activaMasNueva || JSON.stringify(actual.historial) !== JSON.stringify(nuevo.historial);
}

/** Guarda las directivas de una capa si aportan algo nuevo y avisa del cambio. */
export async function guardarDirectivas(
  capa: string,
  archivo: ArchivoDirectivas,
): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !capa) return false;
    const registro = leerDirectivas();
    const saneado = normalizarArchivoDirectivas(archivo);
    if (!saneado || !debeGuardarDirectivas(registro[capa], saneado)) return false;
    registro[capa] = saneado;
    window.localStorage.setItem(DIRECTIVAS_KEY, JSON.stringify(registro));
    window.dispatchEvent(new Event(DIRECTIVAS_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Obtiene la directiva activa de una capa, si su versión y su estado cuadran. */
export function directivaActiva(capa: string): DirectivaCapa | undefined {
  const archivo = leerDirectivas(capa);
  if (!archivo || archivo.activa === null) return undefined;
  return archivo.historial.find(
    (d) => d.version === archivo.activa && d.estado === "activa",
  );
}