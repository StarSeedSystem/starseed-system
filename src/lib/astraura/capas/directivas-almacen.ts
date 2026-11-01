/**
 * Almacén y sincronía de las directivas del automejoramiento Meta^n de las capas de
 * Astraura (MTN1027C). Contrato: architecture/automejora-meta-n.md §4 — las directivas
 * viven en la clave `starseed.capas.directivas.v1` (`Record<capa, ArchivoDirectivas>`)
 * y VIAJAN CON LA CUENTA (SYNCED_KEYS); al llegar de otro medio se anuncia
 * `EVENTO_DIRECTIVAS` (EVENT_BY_KEY, como el Mausbot). Puro, sin `node:*`: lo importa
 * el cliente (CLAUDE.md, trampa 11). Lectura defensiva y try/catch en localStorage.
 */
import type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

export const CLAVE_DIRECTIVAS = "starseed.capas.directivas.v1";
export const EVENTO_DIRECTIVAS = "starseed:capas-directivas";

/** Registro por capa tal como vive en la clave (cada capa lleva su historial). */
export type RegistroDirectivas = Record<string, ArchivoDirectivas>;

/** Almacenamiento inyectable (localStorage del navegador o un doble de prueba). */
export interface AlmacenDirectivas {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

/** Resultado de guardar el archivo de una capa. */
export type ResultadoGuardarDirectiva =
  | { ok: true; guardado: boolean }
  | { ok: false; motivo: string };

const ESTADOS_DIRECTIVA = ["activa", "propuesta", "anterior", "retirada"] as const;
const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

/** Una directiva del historial con todas sus piezas por lo menos de su tipo. */
const directivaValida = (valor: unknown): valor is DirectivaCapa =>
  esObjeto(valor) &&
  typeof valor.capa === "string" && !!valor.capa &&
  typeof valor.version === "number" && Number.isFinite(valor.version) &&
  typeof valor.texto === "string" && typeof valor.sha256 === "string" && !!valor.sha256 &&
  typeof valor.acierto === "number" && typeof valor.base === "number" &&
  typeof valor.n === "number" && typeof valor.fecha === "string" &&
  typeof valor.origen === "string" &&
  (ESTADOS_DIRECTIVA as readonly string[]).includes(valor.estado as string);

/** Valida un archivo: versión 1 con su historial saneado; si no, null. */
export function validarArchivoDirectivas(valor: unknown): ArchivoDirectivas | null {
  if (!esObjeto(valor) || valor.v !== 1) return null;
  if (typeof valor.capa !== "string" || !valor.capa) return null;
  const activaValida =
    valor.activa === null || (typeof valor.activa === "number" && Number.isInteger(valor.activa));
  if (!activaValida || !Array.isArray(valor.historial)) return null;
  const historial = valor.historial.filter(directivaValida);
  return { v: 1, capa: valor.capa, activa: valor.activa as number | null, historial };
}

/** Registro saneado: cada archivo apuntado por SU capa; los inválidos se caen. */
export function normalizarRegistroDirectivas(valor: unknown): RegistroDirectivas {
  if (!esObjeto(valor)) return {};
  const registro: RegistroDirectivas = {};
  for (const archivo of Object.values(valor)) {
    const valido = validarArchivoDirectivas(archivo);
    if (valido) registro[valido.capa] = valido;
  }
  return registro;
}

/** ¿Guarda? Solo si no había nada, la activa es MÁS NUEVA o cambió el historial (§3.5:
 * lo de la cuenta no devuelve la capa a una pauta más vieja; una vuelta atrás SÍ cambia
 * el historial, así que guarda). Puro. */
export function debeGuardarDirectiva(
  actual: ArchivoDirectivas | undefined,
  nuevo: ArchivoDirectivas,
): boolean {
  if (!actual) return true;
  if (JSON.stringify(actual.historial) !== JSON.stringify(nuevo.historial)) return true;
  return (nuevo.activa ?? -1) > (actual.activa ?? -1);
}

function almacenNavegador(): AlmacenDirectivas | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
/** Todo el registro de directivas por capa; ante lo más mínimo raro, {}. */
export function leerDirectivas(almacen?: AlmacenDirectivas): RegistroDirectivas {
  const al = almacen ?? almacenNavegador();
  if (!al) return {};
  try {
    const bruto = JSON.parse(al.getItem(CLAVE_DIRECTIVAS) ?? "{}") as unknown;
    return normalizarRegistroDirectivas(bruto);
  } catch {
    return {};
  }
}

/** Guarda el archivo de UNA capa solo si aporta algo y anuncia `EVENTO_DIRECTIVAS`.
 * El mínimo esfuerzo es el de la cuenta: repetir lo mismo no toca localStorage. */
export function guardarDirectivas(
  capa: string,
  archivo: ArchivoDirectivas,
  almacen?: AlmacenDirectivas,
): ResultadoGuardarDirectiva {
  const al = almacen ?? almacenNavegador();
  if (!al) return { ok: false, motivo: "No hay almacenamiento disponible para las directivas" };
  if (typeof capa !== "string" || !capa) return { ok: false, motivo: "El archivo de directivas necesita su capa" };
  const validado = validarArchivoDirectivas(archivo);
  if (!validado || validado.capa !== capa) {
    return { ok: false, motivo: "El archivo no es un archivo de directivas válido de esa capa" };
  }
  const registro = leerDirectivas(al);
  if (!debeGuardarDirectiva(registro[capa], validado)) return { ok: true, guardado: false };
  al.setItem(CLAVE_DIRECTIVAS, JSON.stringify({ ...registro, [capa]: validado }));
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_DIRECTIVAS));
  } catch { /* la UI releerá por su cuenta */ }
  return { ok: true, guardado: true };
}

/** La directiva activa de esa capa, o undefined si no hay ninguna cuadrada. */
export function directivaActiva(capa: string, almacen?: AlmacenDirectivas): DirectivaCapa | undefined {
  const archivo = leerDirectivas(almacen)[capa];
  if (!archivo || archivo.activa === null) return undefined;
  return archivo.historial.find((d) => d.version === archivo.activa && d.estado === "activa");
}
