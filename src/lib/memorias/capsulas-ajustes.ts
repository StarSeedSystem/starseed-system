// Cápsulas de memoria Memvid por sujeto — ajustes que viajan con la cuenta
// (MVD1027H0 · architecture/memvid-capsulas.md §5). Cliente puro: sin `node:*`,
// sin red y sin claves; lectura defensiva con try/catch y apagado por defecto.

import type { TipoSujeto } from "./capsulas";

/** Clave de localStorage del encendido de cápsula por sujeto (viaja con la cuenta). */
export const CAPSULAS_AJUSTES_KEY = "starseed.memorias.capsulas.v1";

/** Evento disparado al encender o apagar la cápsula de un sujeto, incluido lo llegado de otro medio. */
export const CAPSULAS_EVENT = "starseed:memorias-capsulas";

/** Alias con los nombres que usan realtime-sync.ts y settings-sync.ts. */
export const CLAVE_CAPSULAS = CAPSULAS_AJUSTES_KEY;
export const EVENTO_CAPSULAS = CAPSULAS_EVENT;

/** Sujeto con cápsula configurable: perfil, personalidad, agente, bot, página, grupo,
 *  comunidad, cerebro o capa (capsulas.ts). */
export interface SujetoAjustes {
  tipo: TipoSujeto;
  id: string;
}

/** `{ v: 1, sujetos: Record<"tipo:id", boolean> }`: encendido explícito por sujeto. */
export interface RegistroCapsulas {
  v: 1;
  sujetos: Record<string, boolean>;
}

const REGISTRO_VACIO: RegistroCapsulas = { v: 1, sujetos: {} };

/** «personalidad:aurora» — la clave que vive dentro de `sujetos`. */
export function claveSujeto(tipo: string, id: string): string {
  return `${tipo}:${id}`;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Sanea un ajuste tal como baja de la cuenta o del disco: los valores torcidos
 *  se caen, nunca explotan (lectura defensiva). */
export function normalizarRegistroCapsulas(valor: unknown): RegistroCapsulas | null {
  if (!esObjeto(valor) || valor.v !== 1 || !esObjeto(valor.sujetos)) return null;
  const sujetos: Record<string, boolean> = {};
  for (const [clave, encendido] of Object.entries(valor.sujetos)) {
    if (typeof encendido === "boolean" && clave.includes(":")) sujetos[clave] = encendido;
  }
  return { v: 1, sujetos };
}

/** Cópia pura del registro con el sujeto puesto al valor pedido (no muda el original). */
export function conCapsula(
  registro: RegistroCapsulas,
  sujeto: SujetoAjustes,
  valor: boolean,
): RegistroCapsulas {
  const sujetos = { ...registro.sujetos };
  // Un sujeto sin id no tiene cápsula con nombre: el ajuste no entra.
  if (typeof sujeto.id !== "string" || sujeto.id.trim().length === 0) return registro;
  sujetos[claveSujeto(sujeto.tipo, sujeto.id)] = valor;
  return { v: 1, sujetos };
}

function leerRegistro(): RegistroCapsulas {
  try {
    if (typeof window === "undefined" || !window.localStorage) return REGISTRO_VACIO;
    const raw = window.localStorage.getItem(CAPSULAS_AJUSTES_KEY);
    if (!raw) return REGISTRO_VACIO;
    return normalizarRegistroCapsulas(JSON.parse(raw) as unknown) ?? REGISTRO_VACIO;
  } catch {
    return REGISTRO_VACIO; // JSON roto o almacenamiento sin permiso: cápsulas apagadas
  }
}

/** ¿El sujeto tiene su cápsula de memoria encendida? Apagada por defecto. */
export function capsulaEncendida(sujeto: SujetoAjustes): boolean {
  if (!sujeto || typeof sujeto.id !== "string") return false;
  return leerRegistro().sujetos[claveSujeto(String(sujeto.tipo), sujeto.id)] === true;
}

/** Guarda el ajuste y dispara CAPSULAS_EVENT. Sin almacenamiento disponible → false. */
export function encenderCapsula(sujeto: SujetoAjustes, valor: boolean): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    if (!sujeto || typeof sujeto.id !== "string" || sujeto.id.trim().length === 0) return false;
    const registro = conCapsula(leerRegistro(), sujeto, valor);
    window.localStorage.setItem(CAPSULAS_AJUSTES_KEY, JSON.stringify(registro));
    window.dispatchEvent(new Event(CAPSULAS_EVENT));
    return true;
  } catch {
    return false;
  }
}
