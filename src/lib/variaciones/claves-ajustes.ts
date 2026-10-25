/**
 * Variaciones públicas · claves de Ajustes (Ola 1019V, tarea W).
 * ---------------------------------------------------------------------------
 * Genera la clave canónica `ajuste:<id>` de cada ajuste del OS a partir de sus
 * dos registros con id estable: el buscador de Ajustes (`SETTINGS_SEARCH_INDEX`
 * en `src/components/settings/settings-search.tsx`) y el índice del lienzo de
 * diseño (`SETTINGS_INDEX` en `src/components/design-canvas/settings-index.ts`).
 * La clave nombra el TIPO de ajuste (todas las personas comparten
 * `ajuste:tema-apariencia`), nunca la instancia ni dato privado.
 *
 * Módulo PURO: sin red, sin disco, sin `node:*`, sin DOM. Los paneles de
 * Ajustes ponen la clave en el DOM con `{...atributosClave(clave)}` o con
 * `<ConClave clave>`; aquí solo se decide cuál es la clave.
 *
 * Contrato: architecture/variaciones-publicas.md §2 (familia `ajuste:`) y §5
 * (adaptadores de ajustes, solo claves de `SYNCED_KEYS`/`SYNCED_PREFIXES`).
 */
import { SETTINGS_SEARCH_INDEX } from "@/components/settings/settings-search";
import { SETTINGS_INDEX } from "@/components/design-canvas/settings-index";
import { leerClave, type ClaveElemento } from "./clave-elemento";

/**
 * Normaliza el id de un ajuste al formato canónico (minúsculas kebab-case):
 * el lienzo de diseño nombra sus controles en camelCase (`displacementScale`)
 * y la clave canónica solo admite minúsculas, así que `displacementScale` pasa
 * a ser `displacement-scale`. Devuelve null si el id queda vacío o con
 * caracteres que `leerClave` no acepta: un id mal formado no lleva clave,
 * nunca se inventa una.
 */
export function idNormalizadoDeAjuste(id: string): string | null {
  if (!id) return null;
  const canonico = id
    // camelCase → kebab-case: corta antes de cada mayúscula pegada a minúscula o número.
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
  return leerClave(`ajuste:${canonico}`) ? canonico : null;
}

/**
 * Clave canónica de un ajuste por su id de registro. Acepta tanto el id tal
 * como lo escribe el registro (`displacementScale`) como su forma canónica
 * (`displacement-scale`): normaliza primero y valida después con `leerClave`.
 */
export function claveDeAjuste(id: string): ClaveElemento | null {
  const canonico = idNormalizadoDeAjuste(id);
  return canonico ? `ajuste:${canonico}` : null;
}

/**
 * Ids canónicos de TODOS los ajustes de los dos registros, en orden de
 * registro y sin duplicados (si un id aparece en ambos, la clave es la misma
 * para todas las personas). Los ids que ningún ajuste de verdad usa y los mal
 * formados no entran: la lista solo lleva claves que `leerClave` acepta.
 */
export function idsDeAjustes(): string[] {
  const lista: string[] = [];
  const idsRegistrados = [
    ...SETTINGS_SEARCH_INDEX.map((entrada) => entrada.id),
    ...SETTINGS_INDEX.map((entrada) => entrada.id),
  ];
  for (const id of idsRegistrados) {
    const canonico = idNormalizadoDeAjuste(id);
    if (canonico && !lista.includes(canonico)) lista.push(canonico);
  }
  return lista;
}

/** Claves `ajuste:<id>` de todos los ajustes del OS, en el mismo orden de `idsDeAjustes`. */
export function clavesDeAjustes(): ClaveElemento[] {
  return idsDeAjustes().map((id) => `ajuste:${id}`);
}
