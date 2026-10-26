/** GENESIS · CONECTORES · núcleo PURO de la API de opciones por ámbito (Ola 1019G · GCA1019Lb).
 * Contracto: architecture/genesis-conectores-abiertos.md §3, §4 y §10-L. GET ?ambito= → catálogo
 * filtrado + sugerencias de `sugerir.ts` + asignaciones del ámbito (sin claves); POST vincular
 * guarda cifrado con la bóveda y responde SOLO la huella; POST asignar, la cadena de un rol.
 * Red, reloj, Supabase y la bóveda van INYECTADOS (`PuertosConectores`); jamás registra ni
 * devuelve valores de claves o tokens: solo nombres de variables y huellas (§2). */

import { createHash } from "node:crypto";
import type { Asignacion } from "./asignaciones";
import type { OpcionCatalogo, Papel } from "./catalogo-opciones";
import type { ContenedorOpcion } from "./contenedores";
import { sugerirParaAmbito, type EntradaSugerir } from "./sugerir";

/** Respuesta ya decidida, que la ruta serializa tal cual. */
export interface Respuesta {
  estado: number;
  cuerpo: Record<string, unknown>;
}

/** Puertos del servidor, cableados en la ruta: quien los implanta responde por red, bóveda y reloj. */
export interface PuertosConectores {
  /** ¿Puede la cuenta gestionar accesos y usar las APIs del ámbito? Si no se puede comprobar: false. */
  permiso: (cuenta: string) => Promise<boolean>;
  /** Asignaciones guardadas del ámbito, sin claves (solo ids de cadena). */
  asignaciones: () => Promise<Asignacion<Papel>[]>;
  /** Nombres de proveedor ya vinculados en la bóveda del ámbito; nunca valores. */
  vinculados: () => Promise<ReadonlySet<string>>;
  /** Guarda el valor cifrado en la bóveda; responde huella o error legible. */
  vincular: (proveedor: string, valor: string) => Promise<{ ok: true; huella: string } | { ok: false; error: string }>;
  /** Guarda la cadena de candidatos de un papel en `genesis_asignaciones`. */
  asignar: (clave: string, cadena: string[]) => Promise<{ ok: boolean; error?: string }>;
}

/** Estado que la ruta ya resolvió: sesión, `?ambito=` y catálogo fusión (con contenedores). */
export interface EstadoConectores {
  cuenta: string;
  ambito: string;
  catalogo: OpcionCatalogo[];
  contenedores: ContenedorOpcion[];
}

const MAX_LONGITUD = 120;
const esTexto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Valida el parámetro `?ambito=`: texto no vacío y acotado. */
export function leerAmbito(valor: unknown): { ok: true; ambito: string } | { ok: false; error: string } {
  if (!esTexto(valor)) return { ok: false, error: "Falta ?ambito=." };
  if (valor.trim().length > MAX_LONGITUD) return { ok: false, error: "El ámbito es demasiado largo." };
  return { ok: true, ambito: valor.trim() };
}

export type CuerpoConector =
  | { accion: "vincular"; proveedor: string; valor: string }
  | { accion: "asignar"; clave: string; cadena: string[] };

/** Valida el cuerpo del POST ya parseado: `vincular` o `asignar`, con sus campos obligatorios. */
export function leerCuerpo(bruto: unknown): { ok: true; cuerpo: CuerpoConector } | { ok: false; error: string } {
  if (!bruto || typeof bruto !== "object") return { ok: false, error: "Cuerpo inválido." };
  const b = bruto as Record<string, unknown>;
  if (b.accion === "vincular") {
    if (!esTexto(b.proveedor) || b.proveedor.trim().length > MAX_LONGITUD)
      return { ok: false, error: "Falta o desborda el campo 'proveedor'." };
    if (!esTexto(b.valor)) return { ok: false, error: "Falta el campo 'valor'." };
    return { ok: true, cuerpo: { accion: "vincular", proveedor: b.proveedor.trim(), valor: b.valor } };
  }
  if (b.accion === "asignar") {
    if (!esTexto(b.clave) || b.clave.trim().length > MAX_LONGITUD)
      return { ok: false, error: "Falta o desborda el campo 'clave'." };
    if (!Array.isArray(b.cadena) || b.cadena.length === 0 || !b.cadena.every((x) => typeof x === "string" && x.trim().length > 0))
      return { ok: false, error: "El campo 'cadena' debe ser una lista no vacía de ids." };
    return { ok: true, cuerpo: { accion: "asignar", clave: b.clave.trim(), cadena: b.cadena.map((x) => String(x).trim()) } };
  }
  return { ok: false, error: "La acción debe ser 'vincular' o 'asignar'." };
}

/** Huella SHA-256 del valor: lo único de una clave que puede salir del servidor. */
export const huellaValor = (valor: string): string => createHash("sha256").update(valor).digest("hex");

/** Papeles que toda asignación por defecto cubre (§6 del contrato). */
export const PAPELES_BASE: readonly Papel[] = ["escritor", "revisor", "chat", "visión", "voz", "imagen", "código"];

/** Asignaciones por defecto por papel: gratis primero, sin inventar límites ni tocar el catálogo. */
export function asignacionesSugeridas(catalogo: OpcionCatalogo[]): Asignacion<Papel>[] {
  return PAPELES_BASE.map((clave) => ({ clave, respaldo: [], preferencias: { localPrimero: true, privacidad: "desconocida", presupuesto: null },
    cadena: catalogo.filter((o) => o.papeles.includes(clave) && o.gratis !== null).map((o) => o.id) }));
}

/** Catálogo visible del ámbito: fuera lo «local» del catálogo, que la red no puede vincular:
 * esa capacidad solo la aporta una neurona o servidor del cerebro real (sugerir.ts §2). */
const catalogoVisible = (catalogo: OpcionCatalogo[]): OpcionCatalogo[] => catalogo.filter((o) => o.privacidad !== "local");

/** GET: permiso del ámbito → catálogo filtrado + sugerencias de `sugerir.ts` + asignaciones. */
export async function atenderGet(e: EstadoConectores, p: PuertosConectores): Promise<Respuesta> {
  if (!(await p.permiso(e.cuenta))) return DENEGADO;
  const guardadas = await p.asignaciones();
  const catalogo = catalogoVisible(e.catalogo);
  const asignaciones = guardadas.length ? guardadas : asignacionesSugeridas(catalogo);
  // Las ofertas de neuronas y servidores del cerebro llegan con su tarea de cableado; hoy: vacías.
  const entrada: EntradaSugerir = { asignaciones, catalogo, ofertas: [], vinculadas: await p.vinculados(), contenedores: e.contenedores };
  return { estado: 200, cuerpo: { ambito: e.ambito, sugerencias: sugerirParaAmbito(entrada), asignaciones, catalogo: entrada.catalogo } };
}

/** POST: vincular (bóveda, responde solo la huella) o asignar (cadena de un papel). */
export async function atenderPost(cuerpo: CuerpoConector, e: EstadoConectores, p: PuertosConectores): Promise<Respuesta> {
  if (!(await p.permiso(e.cuenta))) return DENEGADO;
  if (cuerpo.accion === "vincular") {
    const r = await p.vincular(cuerpo.proveedor, cuerpo.valor);
    if (!r.ok) return { estado: estadoDe(r.error), cuerpo: { error: r.error } };
    return { estado: 201, cuerpo: { accion: "vincular", proveedor: cuerpo.proveedor, huella: r.huella, ambito: e.ambito } };
  }
  const validos = [...new Set(cuerpo.cadena)].filter((id) => e.catalogo.some((o) => o.id === id));
  if (validos.length === 0) return { estado: 400, cuerpo: { error: "Ningún id de la cadena está en el catálogo." } };
  const r = await p.asignar(cuerpo.clave, validos);
  if (!r.ok) return { estado: estadoDe(r.error), cuerpo: { error: r.error ?? "No se pudo asignar la cadena." } };
  return { estado: 200, cuerpo: { accion: "asignar", clave: cuerpo.clave, cadena: validos, ambito: e.ambito, ok: true } };
}

const DENEGADO: Respuesta = { estado: 403, cuerpo: { error: "Tu cuenta no tiene permiso de gestión en este ámbito." } };
/** La bóveda sin configurar es un fallo del medio (503), no del que pide. */
const estadoDe = (error?: string): number => (/no configurad[ao]/.test(error ?? "") ? 503 : 400);
