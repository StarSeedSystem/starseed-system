/** Directivas Meta^n por capa (MTN1027 · tarea C; contrato automejora-meta-n.md §3–§4):
 *  viajan con la cuenta por `starseed.capas.directivas.v1` y el evento
 *  `starseed:capas-directivas` refresca la UI (patrón del Mausbot). Puro, sin `node:*`. */
import type { ArchivoDirectivas, DirectivaCapa } from "./directivas";
export type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

export const CLAVE_DIRECTIVAS = "starseed.capas.directivas.v1";
export const EVENTO_DIRECTIVAS = "starseed:capas-directivas";
export type RegistroDirectivas = Record<string, ArchivoDirectivas>;

const ESTADOS = ["activa", "propuesta", "anterior", "retirada"] as const;
const ES_ENTERO = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;
const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const esSha = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
/** Sanea una directiva del historial; `null` si es basura. */
export function normalizarDirectiva(valor: unknown): DirectivaCapa | null {
  if (!esObjeto(valor)) return null;
  const estado = valor.estado;
  const d = {
    capa: typeof valor.capa === "string" ? valor.capa : "",
    version: ES_ENTERO(valor.version) ? valor.version : 0,
    texto: typeof valor.texto === "string" ? valor.texto : "",
    sha256: esSha(valor.sha256) ? valor.sha256 : "",
    acierto: typeof valor.acierto === "number" && valor.acierto >= 0 && valor.acierto <= 1
      ? valor.acierto : -1,
    base: typeof valor.base === "number" && valor.base >= 0 ? valor.base : -1,
    n: ES_ENTERO(valor.n) ? valor.n : -1,
    fecha: typeof valor.fecha === "string" ? valor.fecha : "",
    origen: typeof valor.origen === "string" ? valor.origen : "",
  };
  const valido =
    !!d.capa && d.version > 0 && !!d.texto && !!d.sha256 && d.acierto >= 0 && d.base >= 0 &&
    ES_ENTERO(d.n) && !!d.fecha && !!d.origen &&
    typeof estado === "string" && (ESTADOS as readonly string[]).includes(estado);
  if (!valido) return null;
  const motivo = typeof valor.motivo === "string" && valor.motivo ? valor.motivo : undefined;
  return { ...d, estado: estado as typeof ESTADOS[number], ...(motivo ? { motivo } : {}) };
}

/** Sanea el archivo de UNA capa: versión, activa e historial cuadrados; `null` si es basura. */
export function normalizarArchivoDirectivas(valor: unknown): ArchivoDirectivas | null {
  if (
    !esObjeto(valor) || valor.v !== 1 ||
    typeof valor.capa !== "string" || !valor.capa || !Array.isArray(valor.historial)
  ) return null;
  const historial = valor.historial
    .map((v) => normalizarDirectiva(v))
    .filter((v): v is DirectivaCapa => v !== null);
  // El activa pedido solo vale si ese version está activa en el historial saneado.
  const pedida = valor.activa === null || ES_ENTERO(valor.activa) ? valor.activa : null;
  const activa = pedida === null ? null
    : historial.some((d) => d.version === pedida && d.estado === "activa") ? pedida : null;
  return { v: 1, capa: valor.capa, activa, historial };
}

/** Sanea el registro entero (lo que hay bajo la clave con la cuenta): por capa, suelto lo basura. */
export function normalizarDirectivas(valor: unknown): RegistroDirectivas {
  if (!esObjeto(valor)) return {};
  const registro: RegistroDirectivas = {};
  for (const [capa, valorArchivo] of Object.entries(valor)) {
    const archivo = normalizarArchivoDirectivas(valorArchivo);
    if (archivo) registro[capa] = archivo;
  }
  return registro;
}

/** El historial de `b` ya está igualito dentro del de `a` (b es un eco viejo). */
const historialContenido = (a: DirectivaCapa[], b: DirectivaCapa[]): boolean =>
  b.every((d) => a.some((e) => JSON.stringify(e) === JSON.stringify(d)));

/** ¿Aplica la copia que llega? Solo si su activa es más nueva o el historial trae
 *  cambios que lo guardado no tiene (retirada, vuelta atrás…); un eco idéntico o
 *  una instantánea vieja no reescriben nada. */
export function debeAplicar(
  existente: ArchivoDirectivas | null,
  nueva: ArchivoDirectivas,
): boolean {
  if (!existente) return true;
  if ((nueva.activa ?? -1) > (existente.activa ?? -1)) return true;
  return !historialContenido(existente.historial, nueva.historial);
}

/** Lee el registro entero del `localStorage` con lectura defensiva. */
export function leerDirectivas(): RegistroDirectivas {
  try {
    if (typeof window === "undefined") return {};
    const crudo = window.localStorage.getItem(CLAVE_DIRECTIVAS);
    if (!crudo) return {};
    return normalizarDirectivas(JSON.parse(crudo) as unknown);
  } catch { return {}; } // JSON roto o almacenamiento sin permiso: sin directivas.
}

/** La directiva activa de una capa, o `null` sin almacenamiento/sin capa. */
export function directivaActiva(capa: string): DirectivaCapa | null {
  const archivo = leerDirectivas()[capa];
  if (!archivo || archivo.activa === null) return null;
  return archivo.historial.find(
    (d) => d.version === archivo.activa && d.estado === "activa",
  ) ?? null;
}

/** Guarda el archivo de una capa si toca; devuelve `false` si no aplicó o no se pudo. */
export function guardarDirectivas(capa: string, archivo: ArchivoDirectivas): boolean {
  const sanado = normalizarArchivoDirectivas(archivo);
  if (!sanado || sanado.capa !== capa) return false;
  try {
    if (typeof window === "undefined") return false;
    const registro = leerDirectivas();
    if (!debeAplicar(registro[capa] ?? null, sanado)) return false;
    window.localStorage.setItem(
      CLAVE_DIRECTIVAS, JSON.stringify({ ...registro, [capa]: sanado }),
    );
    window.dispatchEvent(new Event(EVENTO_DIRECTIVAS));
    return true;
  } catch { return false; }
}
