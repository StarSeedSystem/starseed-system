import type { Encargo, Plan } from "./encargo";
import { validarEncargo } from "./encargo";
import type { Ambito } from "@/lib/protomolecula/tipos";

/**
 * ProtoGenesis · Almacén de encargos por cuenta (PG1013G)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Contrato: architecture/protogenesis.md y architecture/protomolecula.md §3·7·8.
 */

/** Estado de un paso en el encargo. */
export type EstadoPaso = "pendiente" | "corriendo" | "ok" | "falla" | "omitido";

/** Registro completo de un encargo con su plan, estados y asignaciones. */
export interface RegistroEncargo {
  encargo: Encargo;
  plan: Plan | null;
  estados: Record<string, EstadoPaso>;
  asignaciones: { paso: string; agente: string }[];
  actualizadoEn: number;
}

/** Interfaz de almacenamiento inyectable (localStorage o similar). */
export interface AlmacenLocal {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** Prefijo para cada encargo almacenado. */
export const PREFIJO_ENCARGO = "starseed.protogenesis.encargos.v1:";
/** Clave del índice que lista todos los ids de encargo. */
export const CLAVE_INDICE = "starseed.protogenesis.encargos.indice.v1";

/**
 * Intenta obtener el almacenamiento del navegador.
 * Devuelve null si no está disponible o hay un error.
 */
export function almacenNavegador(): AlmacenLocal | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Valida que un objeto sea un RegistroEncargo válido. */
function esRegistroEncargoValida(x: unknown): x is RegistroEncargo {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;

  const r = x as Partial<RegistroEncargo>;

  // Validar encargo usando la función del módulo encargo.ts
  const encargoValidacion = validarEncargo(r.encargo);
  if (!encargoValidacion.ok) return false;

  // Validar plan (puede ser null)
  if (r.plan !== null && (!r.plan || typeof r.plan !== "object" || Array.isArray(r.plan))) return false;
  if (r.plan && (!r.plan.encargoId || typeof r.plan.encargoId !== "string")) return false;
  if (r.plan && (!Array.isArray(r.plan.pasos))) return false;

  // Validar estados (record de string a EstadoPaso)
  if (r.estados && typeof r.estados === "object" && !Array.isArray(r.estados)) {
    for (const clave in r.estados) {
      if (typeof r.estados[clave] !== "string") return false;
      const estado = r.estados[clave];
      if (estado !== "pendiente" && estado !== "corriendo" && estado !== "ok" && estado !== "falla" && estado !== "omitido")
        return false;
    }
  } else {
    return false;
  }

  // Validar asignaciones (array de {paso: string, agente: string})
  if (!Array.isArray(r.asignaciones)) return false;
  for (const asig of r.asignaciones) {
    if (typeof asig.paso !== "string" || typeof asig.agente !== "string") return false;
  }

  // Validar actualizadoEn (number)
  if (typeof r.actualizadoEn !== "number" || !Number.isFinite(r.actualizadoEn)) return false;

  return true;
}

/** Lee el índice de ids de encargo almacenados. */
function leerIndice(a: AlmacenLocal): string[] {
  try {
    const crudo = a.getItem(CLAVE_INDICE);
    if (crudo === null) return [];
    const parsed: unknown = JSON.parse(crudo);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

/** Escribe el índice de ids de encargo almacenados. */
function escribirIndice(a: AlmacenLocal, ids: string[]): void {
  a.setItem(CLAVE_INDICE, JSON.stringify(ids));
}

/** Guarda un registro de encargo. Devuelve true si tuvo éxito. */
export function guardarEncargo(a: AlmacenLocal, r: RegistroEncargo): boolean {
  if (!esRegistroEncargoValida(r)) return false;

  try {
    const clave = PREFIJO_ENCARGO + r.encargo.id;
    a.setItem(clave, JSON.stringify(r));

    // Actualizar el índice
    const indice = leerIndice(a);
    if (!indice.includes(r.encargo.id)) {
      indice.push(r.encargo.id);
      escribirIndice(a, indice);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Carga los encargos almacenados, opcionalmente filtrados por molécula.
 * Devuelve los encargos más recientes primero, como mucho 50 por molécula.
 */
export function cargarEncargos(a: AlmacenLocal, moleculaId?: string): RegistroEncargo[] {
  try {
    const indice = leerIndice(a);
    const encargos: RegistroEncargo[] = [];

    for (const id of indice) {
      const crudo = a.getItem(PREFIJO_ENCARGO + id);
      if (crudo === null) continue;
      const parsed: unknown = JSON.parse(crudo);
      if (esRegistroEncargoValida(parsed)) {
        if (moleculaId === undefined || parsed.encargo.moleculaId === moleculaId) {
          encargos.push(parsed);
        }
      }
      // Si no es válido, lo ignoramos (como se especifica: un registro corrupto se ignora)
    }

    // Ordenar por actualizadoEn descending (más reciente primero)
    encargos.sort((a, b) => b.actualizadoEn - a.actualizadoEn);

    // Si se pidió una molécula específica, limitar a 50 para esa molécula
    if (moleculaId !== undefined) {
      return encargos.slice(0, 50);
    }

    // Si no se especificó molécula, devolvemos todos (pero podríamos querer limitar por molécula?)
    // El requisito es: "como mucho 50 por molécula". Sin especificar molécula, no podemos garantizar
    // que no haya más de 50 por molécula en la lista completa.
    // Vamos a agrupar por molécula y tomar los 50 más recientes de cada una.
    const porMolecula: Record<string, RegistroEncargo[]> = {};
    for (const enc of encargos) {
      const molId = enc.encargo.moleculaId;
      if (!porMolecula[molId]) porMolecula[molId] = [];
      porMolecula[molId].push(enc);
    }

    const resultado: RegistroEncargo[] = [];
    for (const molId in porMolecula) {
      const encargosMol = porMolecula[molId];
      encargosMol.sort((a, b) => b.actualizadoEn - a.actualizadoEn);
      resultado.push(...encargosMol.slice(0, 50));
    }

    // Ordenar el resultado final por actualizadoEn descending
    resultado.sort((a, b) => b.actualizadoEn - a.actualizadoEn);
    return resultado;
  } catch {
    return [];
  }
}

/** Borra un encargo por su id. Devuelve true si existed and was removed. */
export function borrarEncargo(a: AlmacenLocal, encargoId: string): boolean {
  try {
    const clave = PREFIJO_ENCARGO + encargoId;
    const existe = a.getItem(clave) !== null;
    if (existe) {
      a.removeItem(clave);
    }

    // Actualizar el índice
    const indice = leerIndice(a);
    const indiceSinId = indice.filter((id) => id !== encargoId);
    if (indiceSinId.length !== indice.length) {
      escribirIndice(a, indiceSinId);
    }

    return existe;
  } catch {
    return false;
  }
}