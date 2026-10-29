/**
 * Variaciones públicas · claves de la familia «ajuste» (Ola 1019V, tarea W).
 * ---------------------------------------------------------------------------
 * Genera las claves `ajuste:<id>` que cada panel de Ajustes pone en el DOM con
 * `data-ss-elemento`, a partir de los dos índices de ajustes que ya existen:
 * `SETTINGS_SEARCH_INDEX` (buscador de /ajustes) y `SETTINGS_INDEX` (lienzo de
 * diseño). La clave nombra el TIPO de ajuste compartido por todas las personas,
 * nunca la instancia ni datos privados (contrato §2).
 *
 * Los ids llegan en cualquier estilo del registro original (camelCase como
 * `displacementScale`, kebab como `tema-apariencia`); `normalizarIdAjuste` los
 * lleva a kebab-case para que la clave pase `leerClave`.
 *
 * Módulo PURO: sin red, sin disco, sin `node:*`, sin DOM. Los índices entran
 * como argumentos (solo necesitamos `{ id }`), para no acoplarlo al componente
 * cliente del buscador.
 *
 * Contrato: architecture/variaciones-publicas.md §2.
 */
import { crearClave, leerClave, type ClaveElemento } from "./clave-elemento";

/** Familia única para los ajustes de todo el OS. */
export const FAMILIA_AJUSTES = "ajuste";

/** Forma mínima de una entrada de índice (SETTINGS_SEARCH_INDEX · SETTINGS_INDEX). */
export interface EntradaIndiceAjustes {
  id: string;
}

/**
 * Normaliza un id de ajuste a kebab-case vía `leerClave`: camelCase se parte
 * en sus límites («displacementScale» → «displacement-scale»), los guiones
 * bajos y espacios también separan, y se colapsan separadores seguidos. Si
 * queda vacío, con caracteres ajenos a un id canónico o mal acabado, devuelve
 * null: sin id válido no hay clave (degrada en silencio, sin inventar).
 */
export function normalizarIdAjuste(id: string): string | null {
  const kebab = id
    .trim()
    .replace(/(?<=[a-z0-9])(?=[A-Z])/g, "-")
    .replace(/[_\s]+/g, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (!kebab) return null;
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(kebab)) return null;
  return kebab;
}

/** Clave canónica `ajuste:<id>` de un ajuste, con parte opcional (`ajuste:<id>#<parte>`). */
export function claveDeAjuste(id: string, parte?: string): ClaveElemento | null {
  const idNormalizado = normalizarIdAjuste(id);
  if (!idNormalizado) return null;
  const clave = crearClave(FAMILIA_AJUSTES, idNormalizado, parte?.trim() || undefined);
  // El formato final manda: si la parte no es canónica, la clave se rechaza entera.
  return leerClave(clave) ? clave : null;
}

/** Claves `ajuste:` únicas, en orden de llegada, de los dos índices de ajustes. */
export function clavesDeAjustes(
  busqueda: readonly EntradaIndiceAjustes[],
  lienzo: readonly EntradaIndiceAjustes[] = [],
): ClaveElemento[] {
  const claves: ClaveElemento[] = [];
  const vistas = new Set<ClaveElemento>();
  for (const entrada of [...busqueda, ...lienzo]) {
    if (!entrada || typeof entrada.id !== "string") continue;
    const clave = claveDeAjuste(entrada.id);
    // El mismo ajuste puede aparecer en los dos índices: la clave solo entra una vez.
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    claves.push(clave);
  }
  return claves;
}
