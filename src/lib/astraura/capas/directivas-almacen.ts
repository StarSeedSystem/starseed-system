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

const esDirectiva = (v: unknown): v is DirectivaCapa => {
  if (!esObjeto(v)) return false;
  return (
    typeof v.capa === "string" && typeof v.version === "number" &&
    typeof v.texto === "string" && typeof v.sha256 === "string" &&
    typeof v.acierto === "number" && typeof v.base === "number" &&
    typeof v.n === "number" && typeof v.fecha === "string" &&
    typeof v.origen === "string" &&
    ESTADOS.includes(v.estado as (typeof ESTADOS)[number])
  );
};

const esArchivo = (v: unknown): v is ArchivoDirectivas =>
  esObjeto(v) && v.v === 1 && typeof v.capa === "string" &&
  (v.activa === null || typeof v.activa === "number") &&
  Array.isArray(v.historial) && v.historial.every(esDirectiva);

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
      if (!esObjeto(parsed)) return mapa;
      for (const [capa, archivo] of Object.entries(parsed)) {
        if (esArchivo(archivo)) mapa[capa] = archivo;
      }
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

/** Regla pura: ¿el archivo nuevo debe pisar al guardado? */
export function debeGuardarDirectivas(
  previo: ArchivoDirectivas | undefined,
  nuevo: ArchivoDirectivas,
): boolean {
  if (!previo) return true;
  const masNueva =
    nuevo.activa !== null && (previo.activa === null || nuevo.activa > previo.activa);
  const historialCambio =
    JSON.stringify(nuevo.historial) !== JSON.stringify(previo.historial);
  return masNueva || historialCambio;
}

/** Guarda las directivas de una capa si aportan algo nuevo y avisa del cambio. */
export async function guardarDirectivas(
  capa: string,
  archivo: ArchivoDirectivas,
): Promise<boolean> {
  if (!capa || !esArchivo(archivo)) return false;
  const guardado = conAlmacen((ls) => {
    try {
      const mapa = mapaCompleto();
      if (!debeGuardarDirectivas(mapa[capa], archivo)) return false;
      mapa[capa] = archivo;
      ls.setItem(DIRECTIVAS_KEY, JSON.stringify(mapa));
      return true;
    } catch {
      return false;
    }
  }, false);
  if (!guardado) return false;
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(DIRECTIVAS_EVENT));
    }
  } catch {
    // Sin ventana o sin oyentes: el dato ya está guardado.
  }
  return true;
}

/** Obtiene la directiva activa de una capa, si su versión y su estado cuadran. */
export function directivaActiva(capa: string): DirectivaCapa | undefined {
  const archivo = leerDirectivas(capa);
  if (!archivo || archivo.activa === null) return undefined;
  return archivo.historial.find(
    (d) => d.version === archivo.activa && d.estado === "activa",
  );
}
