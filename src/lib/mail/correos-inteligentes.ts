/**
 * CORREOS INTELIGENTES · módulo puro (rescate RTTRD1020Db-d2, rama nube/40502103787).
 * Valida reglas de bandeja, las aplica a un correo concreto y clasifica los hilos
 * de seguimiento (por-responder / esperando / resuelto). Sin red ni disco:
 * entrada → salida; el cableado a los hilos reales va en su propia tarea.
 */

export type AccionCorreo = "etiquetar" | "mover" | "destacar" | "sugerir-borrador" | "esperar-respuesta";

export type CondicionRegla = {
  etiqueta?: string;
  de?: string;
  dominio?: string;
  asuntoContiene?: string;
  tieneAdjunto?: boolean;
  antiguedadHorasMin?: number;
};

export type ReglaCorreo = { id: string; hacer: AccionCorreo; cuando?: CondicionRegla; texto?: string; parametro?: string };
export type AccionPropuesta = { reglaId: string; tipo: AccionCorreo; parametro?: string };
export type CorreoAReglas = { de: string; asunto: string; fecha: string | Date; tieneAdjunto?: boolean };
export type MensajeSeguimiento = { de: string; fecha: string | Date };
export type UmbralesSeguimiento = { horasPorResponder?: number; diasEsperando?: number };
export type EstadoSeguimiento = "por-responder" | "esperando" | "resuelto";
export type ResumenSeguimiento = { porResponder: number; esperando: number; resuelto: number; total: number };

/** Acciones que una regla puede pedir; todo lo demás se rechaza. */
const ACCIONES: readonly string[] = ["etiquetar", "mover", "destacar", "sugerir-borrador", "esperar-respuesta"];
/** Claves válidas de una condición, con el tipo de valor que admite cada una. */
const CAMPOS_CONDICION: Record<string, "cadena" | "booleano" | "numero"> = {
  etiqueta: "cadena",
  de: "cadena",
  dominio: "cadena",
  asuntoContiene: "cadena",
  tieneAdjunto: "booleano",
  antiguedadHorasMin: "numero",
};
const CLAVES_REGLA = ["id", "hacer", "cuando", "texto", "parametro"];
const TOPE_TEXTO = 200;
const TOPE_PARAMETRO = 100;
const HORAS_POR_RESPONDER = 24;
const DIAS_ESPERANDO = 7;

function esCadenaLimpia(valor: unknown, tope: number): boolean {
  return typeof valor === "string" && valor.trim().length > 0 && valor.length <= tope;
}

/** Una condición solo trae claves conocidas con el tipo que toque (vacía vale). */
export function condicionValida(cuando: unknown): boolean {
  if (typeof cuando !== "object" || cuando === null) return false;
  for (const [clave, valor] of Object.entries(cuando as Record<string, unknown>)) {
    const tipo = CAMPOS_CONDICION[clave];
    if (!tipo || valor === undefined) return false;
    if (tipo === "cadena" && !esCadenaLimpia(valor, TOPE_PARAMETRO)) return false;
    if (tipo === "booleano" && typeof valor !== "boolean") return false;
    if (tipo === "numero" && (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0)) return false;
  }
  return true;
}

/** Una regla vale si su forma es estricta (sin campos extra) y sus valores saneados. */
export function validarRegla(entrada: unknown): boolean {
  if (typeof entrada !== "object" || entrada === null) return false;
  const regla = entrada as Record<string, unknown>;
  for (const clave of Object.keys(regla)) {
    if (!CLAVES_REGLA.includes(clave)) return false;
  }
  if (!esCadenaLimpia(regla.id, TOPE_PARAMETRO)) return false;
  if (typeof regla.hacer !== "string" || !ACCIONES.includes(regla.hacer)) return false;
  if (regla.texto !== undefined && !esCadenaLimpia(regla.texto, TOPE_TEXTO)) return false;
  if (regla.parametro !== undefined && !esCadenaLimpia(regla.parametro, TOPE_PARAMETRO)) return false;
  if (regla.cuando !== undefined && !condicionValida(regla.cuando)) return false;
  return true;
}

/** Dominio destinatario de una dirección (`ana@ejemplo.com` → `ejemplo.com`). */
function dominioDe(direccion: string): string {
  const arroba = direccion.lastIndexOf("@");
  return (arroba < 0 ? direccion : direccion.slice(arroba + 1)).trim().toLowerCase();
}

/** Antigüedad del dato `fecha` respecto a `ahora`, en horas. */
function horasDesde(fecha: string | Date, ahora: string | Date): number {
  return (new Date(ahora).getTime() - new Date(fecha).getTime()) / 3_600_000;
}

/** La condición exigida (si la hay) se cumple plenamente contra este correo. */
function condicionCumplida(
  cuando: CondicionRegla | undefined,
  correo: CorreoAReglas,
  ahora: string | Date,
): boolean {
  if (!cuando) return true;
  if (cuando.tieneAdjunto !== undefined && (correo.tieneAdjunto ?? false) !== cuando.tieneAdjunto) return false;
  if (cuando.de !== undefined && correo.de.trim().toLowerCase() !== cuando.de.trim().toLowerCase()) return false;
  if (cuando.dominio !== undefined && dominioDe(correo.de) !== cuando.dominio.trim().toLowerCase()) return false;
  if (cuando.asuntoContiene !== undefined && !correo.asunto.toLowerCase().includes(cuando.asuntoContiene.toLowerCase())) return false;
  if (cuando.antiguedadHorasMin !== undefined && !(horasDesde(correo.fecha, ahora) > cuando.antiguedadHorasMin)) return false;
  return true;
}

/**
 * Propone las acciones que este correo merece: solo reglas válidas y cuyo
 * `cuando` se cumple, en orden, deduplicadas por acción y parámetro.
 */
export function aplicarReglas(
  reglas: readonly unknown[],
  correo: CorreoAReglas,
  ahora: string | Date,
): AccionPropuesta[] {
  const propuestas: AccionPropuesta[] = [];
  const vistas = new Set<string>();
  for (const entrada of reglas) {
    if (!validarRegla(entrada)) continue;
    const regla = entrada as ReglaCorreo;
    if (!condicionCumplida(regla.cuando, correo, ahora)) continue;
    const clave = `${regla.hacer}::${regla.parametro ?? ""}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const propuesta: AccionPropuesta = { reglaId: regla.id, tipo: regla.hacer };
    if (regla.parametro !== undefined) propuesta.parametro = regla.parametro;
    propuestas.push(propuesta);
  }
  return propuestas;
}

/**
 * Estado del seguimiento de un hilo por ÚLTIMO mensaje: de otro y con «más de»
 * N horas → por-responder; mío y con más de D días → esperando; lo demás
 * (vacío incluido) → resuelto.
 */
export function clasificarHilo(
  mensajes: readonly MensajeSeguimiento[],
  yo: string,
  ahora: string | Date,
  umbrales: UmbralesSeguimiento = {},
): EstadoSeguimiento {
  const ultimo = mensajes[mensajes.length - 1];
  if (!ultimo) return "resuelto";
  const horas = horasDesde(ultimo.fecha, ahora);
  if (ultimo.de.trim().toLowerCase() === yo.trim().toLowerCase()) {
    return horas / 24 > (umbrales.diasEsperando ?? DIAS_ESPERANDO) ? "esperando" : "resuelto";
  }
  return horas > (umbrales.horasPorResponder ?? HORAS_POR_RESPONDER) ? "por-responder" : "resuelto";
}

/** Cuenta los tres estados de una bandeja completa. */
export function resumenSeguimiento(
  hilos: readonly MensajeSeguimiento[][],
  yo: string,
  ahora: string | Date,
): ResumenSeguimiento {
  const resumen: ResumenSeguimiento = { porResponder: 0, esperando: 0, resuelto: 0, total: hilos.length };
  for (const hilo of hilos) {
    const estado = clasificarHilo(hilo, yo, ahora);
    if (estado === "por-responder") resumen.porResponder += 1;
    else if (estado === "esperando") resumen.esperando += 1;
    else resumen.resuelto += 1;
  }
  return resumen;
}
