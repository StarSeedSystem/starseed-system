/**
 * Almacén CLIENTE de las directivas de automejora Meta^n por capa (MTN1027C).
 * Contrato: architecture/automejora-meta-n.md §3–§4 — la clave
 * `starseed.capas.directivas.v1` (Record<capa, ArchivoDirectivas>) viaja con la
 * cuenta (SYNCED_KEYS + EVENT_BY_KEY, como `starseed.mausbot.v1`). Sin `node:*`;
 * solo localStorage, defensivo y con try/catch, al estilo de mausbot/config.ts.
 * Se guarda solo si la activa que llega es más nueva o cambió el historial.
 */
import { type ArchivoDirectivas, type DirectivaCapa } from "./directivas";
export type { ArchivoDirectivas, DirectivaCapa };

export const CLAVE_DIRECTIVAS = "starseed.capas.directivas.v1";
export const EVENTO_DIRECTIVAS = "starseed:capas-directivas";
/** Todo el registro de la cuenta: cada capa con su archivo de directivas. */
export type RegistroDirectivas = Record<string, ArchivoDirectivas>;

const ESTADOS: readonly string[] = ["activa", "propuesta", "anterior", "retirada"];
const OBLIGATORIOS: readonly string[] = ["capa", "sha256", "texto", "origen", "fecha"];
const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const numero = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** Normaliza una directiva; los campos ilegibles la descartan, nunca explota. */
function normalizarDirectiva(v: unknown): DirectivaCapa | null {
  if (!esObjeto(v) || !OBLIGATORIOS.every((c) => typeof v[c] === "string")) return null;
  // Estado desconocido: «retirada», que nunca puede valer como «activa».
  const estado = typeof v.estado === "string" && ESTADOS.includes(v.estado)
    ? (v.estado as DirectivaCapa["estado"]) : "retirada";
  return {
    capa: v.capa as string, version: numero(v.version), texto: v.texto as string,
    sha256: v.sha256 as string, acierto: numero(v.acierto), base: numero(v.base),
    n: numero(v.n), fecha: v.fecha as string, origen: v.origen as string, estado,
    ...(typeof v.motivo === "string" ? { motivo: v.motivo } : {}),
  };
}

/** Normaliza el archivo de una capa; versión desconocida o historial basura → null. */
export function normalizarArchivo(valor: unknown): ArchivoDirectivas | null {
  if (!esObjeto(valor) || valor.v !== 1 || typeof valor.capa !== "string" ||
      !Array.isArray(valor.historial)) return null;
  const historial = valor.historial.map(normalizarDirectiva)
    .filter((d): d is DirectivaCapa => d !== null);
  return {
    v: 1, capa: valor.capa,
    activa: typeof valor.activa === "number" ? valor.activa : null, historial,
  };
}

/** Registro entero saneado: las capas ilegibles se caen, el resto se normaliza. */
export function normalizarRegistroDirectivas(valor: unknown): RegistroDirectivas {
  const registro: RegistroDirectivas = {};
  if (esObjeto(valor)) for (const [capa, archivo] of Object.entries(valor)) {
    const valido = normalizarArchivo(archivo);
    if (valido) registro[capa] = valido;
  }
  return registro;
}

/** Identidad canónica de una directiva: todo su contenido, orden aparte. */
const identidad = (d: DirectivaCapa): string =>
  `${d.version}|${d.sha256}|${d.estado}|${d.texto}|${d.n}|${d.acierto}|${d.base}|${d.fecha}|${d.motivo ?? ""}`;

/** Versión más alta del historial: el que llega con menos versiones está por detrás. */
const versionMaxima = (archivo: ArchivoDirectivas): number =>
  archivo.historial.reduce((m, d) => Math.max(m, d.version), 0);

/**
 * ¿Gana el archivo que llega la posición del que ya hay? (contrato §3.5/§4):
 * si su versión ACTIVA es más nueva (con su ficha en el historial), o si cambió
 * el historial sin estar por detrás. Un archivo viejo cuyo historial es un
 * subconjunto del actual NO gana (copia atrasada); nunca manda el reloj.
 */
export function ganaGuardado(actual: ArchivoDirectivas | undefined, nueva: ArchivoDirectivas): boolean {
  if (!actual) return true;
  if (nueva.activa !== null && (actual.activa === null || nueva.activa > actual.activa) &&
      nueva.historial.some((d) => d.version === nueva.activa)) return true;
  if (versionMaxima(nueva) < versionMaxima(actual)) return false;
  const vueltas = new Set(actual.historial.map(identidad));
  return nueva.historial.some((d) => !vueltas.has(identidad(d)));
}

/** Lectura defensiva del registro de la cuenta. Nunca lanza. */
export function leerDirectivas(): RegistroDirectivas {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(CLAVE_DIRECTIVAS);
    return normalizarRegistroDirectivas(raw ? (JSON.parse(raw) as unknown) : {});
  } catch { /* JSON roto o almacenamiento sin permiso: registro vacío. */ }
  return {};
}

/** La directiva ACTIVA de una capa según un registro dado (puro, reutilizable). */
export function activaDeRegistro(registro: RegistroDirectivas, capa: string): DirectivaCapa | undefined {
  const archivo = registro[capa];
  if (!archivo || archivo.activa === null) return undefined;
  return archivo.historial.find((d) => d.version === archivo.activa && d.estado === "activa");
}

/** La directiva activa de una capa en ESTE dispositivo. */
export function directivaActiva(capa: string): DirectivaCapa | undefined {
  return activaDeRegistro(leerDirectivas(), capa);
}
/**
 * Guarda el archivo de una capa SOLO si gana la posición del actual; al
 * escribir emite `EVENTO_DIRECTIVAS`. Devuelve si escribió; sin cuota o sin
 * permiso, no escribe y no lanza.
 */
export function guardarDirectivas(capa: string, archivo: ArchivoDirectivas): boolean {
  const nueva = normalizarArchivo(archivo);
  if (!nueva) return false;
  const registro = leerDirectivas();
  if (!ganaGuardado(registro[capa], nueva)) return false;
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(CLAVE_DIRECTIVAS, JSON.stringify({ ...registro, [capa]: nueva }));
    window.dispatchEvent(new Event(EVENTO_DIRECTIVAS));
    return true;
  } catch { return false; }
}
