/**
 * Ventana de la Protomolécula · historial reciente de peticiones (local y acotado). Vive solo en este
 * aparato (localStorage), con un máximo de `MAX_HISTORIAL` entradas, sin duplicados y con try/catch en cada
 * lectura y escritura: sin almacenamiento, la ventana funciona igual y simplemente no recuerda.
 */
import type { ModoEdicion } from "@/lib/protomolecula/peticion/contrato";
import { MAX_HISTORIAL, MAX_TEXTO_PETICION, type EntradaHistorial } from "./tipos";

export const CLAVE_HISTORIAL = "starseed.protomolecula.ventana.historial.v1";

interface Almacen { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const almacenLocal = (): Almacen | null => {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
};

const obj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const modo = (x: unknown): x is ModoEdicion => x === "directo" || x === "rama";

function entradaValida(x: unknown): EntradaHistorial | null {
  if (!obj(x) || typeof x.texto !== "string" || !x.texto.trim() || !modo(x.modo) || typeof x.ruta !== "string" || typeof x.en !== "number" || !Number.isFinite(x.en)) return null;
  const e: EntradaHistorial = { texto: x.texto.slice(0, MAX_TEXTO_PETICION), modo: x.modo, ruta: x.ruta.slice(0, 300), en: x.en };
  if (typeof x.donde === "string" && x.donde) e.donde = x.donde.slice(0, 160);
  return e;
}

/** Lo que se lee no es de fiar: se comprueba entrada a entrada y se acota. */
export function leerHistorial(a: Almacen | null = almacenLocal()): EntradaHistorial[] {
  try {
    const crudo = a?.getItem(CLAVE_HISTORIAL);
    const datos: unknown = crudo ? JSON.parse(crudo) : [];
    if (!Array.isArray(datos)) return [];
    return datos.map(entradaValida).filter((e): e is EntradaHistorial => e !== null).slice(0, MAX_HISTORIAL);
  } catch { return []; }
}

/** Pura: añade al principio, quita el duplicado (mismo texto y modo) y recorta. */
export function conEntrada(lista: EntradaHistorial[], nueva: EntradaHistorial): EntradaHistorial[] {
  const clave = (e: EntradaHistorial) => `${e.modo}|${e.texto.trim().toLowerCase()}`;
  return [nueva, ...lista.filter((e) => clave(e) !== clave(nueva))].slice(0, MAX_HISTORIAL);
}

function guardar(lista: EntradaHistorial[], a: Almacen | null): boolean {
  try { a?.setItem(CLAVE_HISTORIAL, JSON.stringify(lista)); return Boolean(a); } catch { return false; }
}

export function recordarPeticion(nueva: EntradaHistorial, a: Almacen | null = almacenLocal()): EntradaHistorial[] {
  const lista = conEntrada(leerHistorial(a), { ...nueva, texto: nueva.texto.trim().slice(0, MAX_TEXTO_PETICION) });
  guardar(lista, a);
  return lista;
}

export function borrarHistorial(a: Almacen | null = almacenLocal()): void {
  try { a?.removeItem(CLAVE_HISTORIAL); } catch { /* sin almacenamiento: nada que borrar */ }
}
