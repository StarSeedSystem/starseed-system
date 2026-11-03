/**
 * Almacén de directivas aprendidas por la automejora Meta^n de las capas de Astraura
 * (MTN1027C). Clave de localStorage `starseed.capas.directivas.v1` =
 * Record<capa, ArchivoDirectivas>, compartida por la cuenta. Módulo de cliente: sin
 * `node:*`, sin red y sin claves. Contrato: `architecture/automejora-meta-n.md` §4.
 */
import type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

export type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

/** Clave de localStorage donde se guardan las directivas por capa. */
export const DIRECTIVAS_KEY = "starseed.capas.directivas.v1";

/** Evento que avisa a la UI de que cambiaron las directivas de una capa. */
export const DIRECTIVAS_EVENT = "starseed:capas-directivas";

type RegistroDirectivas = Record<string, ArchivoDirectivas>;

const ESTADOS: readonly string[] = ["activa", "propuesta", "anterior", "retirada"];

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

const esDirectiva = (valor: unknown): valor is DirectivaCapa =>
  esObjeto(valor) &&
  typeof valor.capa === "string" &&
  typeof valor.version === "number" &&
  typeof valor.texto === "string" &&
  typeof valor.sha256 === "string" &&
  typeof valor.acierto === "number" &&
  typeof valor.base === "number" &&
  typeof valor.n === "number" &&
  typeof valor.fecha === "string" &&
  typeof valor.origen === "string" &&
  typeof valor.estado === "string" &&
  ESTADOS.includes(valor.estado);

const esArchivo = (valor: unknown): valor is ArchivoDirectivas =>
  esObjeto(valor) &&
  valor.v === 1 &&
  typeof valor.capa === "string" &&
  (valor.activa === null || typeof valor.activa === "number") &&
  Array.isArray(valor.historial) &&
  valor.historial.every(esDirectiva);

/** Registro completo; las entradas rotas se caen sin romper el resto. */
function leerRegistro(): RegistroDirectivas {
  try {
    if (typeof window === "undefined") return {};
    const crudo = window.localStorage.getItem(DIRECTIVAS_KEY);
    if (!crudo) return {};
    const datos: unknown = JSON.parse(crudo);
    if (!esObjeto(datos)) return {};
    const registro: RegistroDirectivas = {};
    for (const [capa, archivo] of Object.entries(datos)) {
      if (esArchivo(archivo)) registro[capa] = archivo;
    }
    return registro;
  } catch {
    return {};
  }
}

/** Lee las directivas de una capa; null si no hay dato o no tiene forma válida. */
export function leerDirectivas(capa: string): ArchivoDirectivas | null {
  return leerRegistro()[capa] ?? null;
}

/** ¿El archivo que llega aporta algo nuevo (activa distinta u historial cambiado)? */
const aporta = (nuevo: ArchivoDirectivas, previo: ArchivoDirectivas | undefined): boolean =>
  !previo ||
  nuevo.activa !== previo.activa ||
  JSON.stringify(nuevo.historial) !== JSON.stringify(previo.historial);

/**
 * Guarda el archivo de una capa si su versión activa cambió o el historial es otro.
 * Devuelve true solo cuando escribió y emitió `DIRECTIVAS_EVENT`.
 */
export function guardarDirectivas(capa: string, archivo: ArchivoDirectivas): boolean {
  if (!esArchivo(archivo)) return false;
  try {
    if (typeof window === "undefined") return false;
    const registro = leerRegistro();
    if (!aporta(archivo, registro[capa])) return false;
    registro[capa] = archivo;
    window.localStorage.setItem(DIRECTIVAS_KEY, JSON.stringify(registro));
    window.dispatchEvent(new Event(DIRECTIVAS_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Directiva activa de la capa: la del historial cuya versión y estado cuadran. */
export function directivaActiva(capa: string): DirectivaCapa | undefined {
  const archivo = leerDirectivas(capa);
  if (!archivo || archivo.activa === null) return undefined;
  return archivo.historial.find(
    (d) => d.version === archivo.activa && d.estado === "activa",
  );
}
