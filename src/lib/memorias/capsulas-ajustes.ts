// Ajustes de cápsulas Memvid por sujeto (MVD1027H0 · H0) — módulo PURO: sin `node:*`, red ni claves.
// Qué sujetos tienen la cápsula encendida (viaja con la cuenta). Apagada por defecto.

import type { TipoSujeto } from "./capsulas";

/** Clave de localStorage: `{ v: 1, sujetos: Record<"tipo:id", boolean> }` */
export const CAPSULAS_KEY = "starseed.memorias.capsulas.v1";

/** Evento emitido cuando cambia el estado de una cápsula. */
export const CAPSULAS_EVENT = "starseed:memorias-capsulas";

/** Estructura guardada en localStorage. */
export interface SujetosCapsulas {
  v: 1;
  sujetos: Record<string, boolean>;
}

/** Forma la clave interna "tipo:id" a partir de un sujeto. */
function claveDe(tipo: TipoSujeto, id: string): string {
  return `${tipo}:${id}`;
}

/** Forma la clave interna "tipo:id" a partir de un string "tipo:id". */
function claveDeParametro(valor: string): string {
  return valor;
}

/** Sanea el objeto que llega de la cuenta (o de localStorage) a la forma canónica. */
export function normalizarSujetosCapsulas(valor: unknown): SujetosCapsulas {
  if (
    typeof valor === "object" &&
    valor !== null &&
    !Array.isArray(valor) &&
    (valor as Record<string, unknown>).v === 1 &&
    typeof (valor as Record<string, unknown>).sujetos === "object" &&
    (valor as Record<string, unknown>).sujetos !== null &&
    !Array.isArray((valor as Record<string, unknown>).sujetos)
  ) {
    const sujetos = (valor as Record<string, unknown>).sujetos as Record<string, unknown>;
    const limpios: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(sujetos)) {
      if (typeof v === "boolean") limpios[k] = v;
    }
    return { v: 1, sujetos: limpios };
  }
  return { v: 1, sujetos: {} };
}

/** Lee el objeto completo de forma defensiva. */
function leerTodo(): SujetosCapsulas {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return { v: 1, sujetos: {} };
    }
    const raw = window.localStorage.getItem(CAPSULAS_KEY);
    if (!raw) return { v: 1, sujetos: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      (parsed as Record<string, unknown>).v === 1 &&
      typeof (parsed as Record<string, unknown>).sujetos === "object" &&
      (parsed as Record<string, unknown>).sujetos !== null &&
      !Array.isArray((parsed as Record<string, unknown>).sujetos)
    ) {
      return parsed as SujetosCapsulas;
    }
    return { v: 1, sujetos: {} };
  } catch {
    return { v: 1, sujetos: {} };
  }
}

/** Escribe el objeto completo de forma defensiva. */
function escribirTodo(sujetos: SujetosCapsulas): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    window.localStorage.setItem(CAPSULAS_KEY, JSON.stringify(sujetos));
    return true;
  } catch {
    return false;
  }
}

/** Comprueba si la cápsula de un sujeto está encendida. Apagada por defecto. */
export function capsulaEncendida(tipo: TipoSujeto, id: string): boolean;
export function capsulaEncendida(sujeto: string): boolean;
export function capsulaEncendida(tipoOsujeto: TipoSujeto | string, id?: string): boolean {
  const key = id !== undefined ? claveDe(tipoOsujeto as TipoSujeto, id) : claveDeParametro(tipoOsujeto as string);
  const data = leerTodo();
  return data.sujetos[key] === true;
}

/** Enciende o apaga la cápsula de un sujeto. Emite evento si cambia el valor. */
export function encenderCapsula(tipo: TipoSujeto, id: string, valor: boolean): boolean;
export function encenderCapsula(sujeto: string, valor: boolean): boolean;
export function encenderCapsula(tipoOsujeto: TipoSujeto | string, idOvalor: string | boolean, valor?: boolean): boolean {
  const key = typeof idOvalor === "string" ? claveDe(tipoOsujeto as TipoSujeto, idOvalor) : claveDeParametro(tipoOsujeto as string);
  const nuevoValor = typeof idOvalor === "boolean" ? idOvalor : (valor ?? false);

  const data = leerTodo();
  const actual = data.sujetos[key] === true;
  if (actual === nuevoValor) return false;

  data.sujetos[key] = nuevoValor;
  const ok = escribirTodo(data);
  if (ok) {
    try {
      window.dispatchEvent(new Event(CAPSULAS_EVENT));
    } catch {
      /* noop: un listener roto no debe tirar al resto */
    }
  }
  return ok;
}