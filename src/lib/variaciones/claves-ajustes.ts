/**
 * Variaciones públicas · claves `ajuste:` para el clic derecho de los
 * paneles de Ajustes (contrato: architecture/variaciones-publicas.md §2,
 * tarea W Ola 1019V). Cada panel llama `clavesDeAjustes(SETTINGS_SEARCH_INDEX,
 * SETTINGS_INDEX)` y expande la clave en su bloque con el componente
 * `<ConClave>`; el atributo que viaja al DOM es `data-ss-elemento`.
 *
 * Módulo PURO: los índices llegan INYECTADOS (aquí no se importa el
 * componente del buscador ni el lienzo de diseño), sin red, sin disco y sin
 * `node:*`. La clave nombra el TIPO de ajuste, nunca la instancia ni dato
 * privado; un id que no de una clave canónica se degrada en silencio.
 */
import { leerClave, type ClaveElemento } from "./clave-elemento";

/** Forma mínima que pide una entrada de cualquier índice de ajustes: `{ id }`. */
export interface EntradaAjusteId {
  id: string;
}

/** Normaliza un id a kebab-case (`displacementScale` → `displacement-scale`). */
export function aKebab(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

/** Clave `ajuste:<id>` del ajuste si el id normalizado es canónica; null si no. */
export function claveDeAjuste(id: string): ClaveElemento | null {
  if (!id) return null;
  const clave = `ajuste:${aKebab(id)}`;
  return leerClave(clave) ? clave : null;
}

/**
 * Claves `ajuste:` de los dos índices de Ajustes — el buscador
 * (`SETTINGS_SEARCH_INDEX`) primero, el del lienzo (`SETTINGS_INDEX`)
 * después — deduplicadas y en orden de llegada. Las entradas sin `id`, o con
 * un id que no da clave canónica, quedan fuera; nunca inventa claves.
 */
export function clavesDeAjustes(
  busqueda: readonly EntradaAjusteId[],
  indice: readonly EntradaAjusteId[],
): ClaveElemento[] {
  const claves: ClaveElemento[] = [];
  for (const entrada of [...busqueda, ...indice]) {
    if (!entrada || typeof entrada.id !== "string" || !entrada.id) continue;
    const clave = claveDeAjuste(entrada.id);
    if (clave && !claves.includes(clave)) claves.push(clave);
  }
  return claves;
}
