/**
 * Variaciones públicas · claves `ajuste:` para los paneles de Ajustes
 * (Ola 1019V · tarea W · contrato architecture/variaciones-publicas.md §2).
 * ----------------------------------------------------------------------------
 * Las claves se generan a partir de los dos registros que ya existen:
 *   · SETTINGS_SEARCH_INDEX (src/components/settings/settings-search.tsx) —
 *     el buscador global de /ajustes;
 *   · SETTINGS_INDEX (src/components/design-canvas/settings-index.ts) — los
 *     efectos y componentes del lienzo de diseño.
 *
 * Una clave nombra el TIPO de ajuste (todas las personas comparten
 * `ajuste:tema-apariencia`), nunca la instancia ni dato privado. Los id del
 * lienzo llegan en camelCase (`displacementScale`) y la clave canónica va en
 * kebab-case (`ajuste:displacement-scale`), que es lo que `leerClave`
 * acepta; los id con minúsculas o mayúsculas nuevos se normalizan igual.
 *
 * Módulo PURO: sin red, sin disco, sin `node:*`. El atributo DOM lo pone
 * cada componente (o `<ConClave>`) a partir de `atributosDeAjuste`.
 */
import { leerClave, type ClaveElemento } from "./clave-elemento";
import { SETTINGS_SEARCH_INDEX } from "@/components/settings/settings-search";
import { SETTINGS_INDEX } from "@/components/design-canvas/settings-index";

/** De dónde salió la clave: el buscador de Ajustes o el lienzo de diseño. */
export type FuenteAjuste = "buscador" | "lienzo";

/** Una clave `ajuste:` generada, con su id original y etiqueta legible. */
export interface ClaveAjuste {
  clave: ClaveElemento;
  id: string;
  label: string;
  fuente: FuenteAjuste;
}

/**
 * Id canónico de un ajuste: camelCase → kebab-case, guiones bajos a
 * guiones y todo en minúsculas. Devuelve null si el resultado no pasa
 * `leerClave` (id vacío o con caracteres que la clave no admite).
 */
function idCanonicaAjuste(id: string): string | null {
  const base = id
    .trim()
    .replace(/_/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
  if (!base) return null;
  return leerClave(`ajuste:${base}`) ? base : null;
}

/** Entrada bruta del registro: los dos índices se reducen a esta forma. */
interface EntradaRegistro {
  id: string;
  label: string;
  fuente: FuenteAjuste;
}

const REGISTRO_AJUSTES: EntradaRegistro[] = [
  ...SETTINGS_SEARCH_INDEX.map((e) => ({ id: e.id, label: e.label, fuente: "buscador" as const })),
  ...SETTINGS_INDEX.map((e) => ({ id: e.id, label: e.label, fuente: "lienzo" as const })),
];

/**
 * Claves válidas de los dos registros, sin duplicados: si un id apareciera
 * en ambos índices (o dos id canonicalizaran al mismo), manda su primera
 * aparición y el resto queda sin clave propia.
 */
const CLAVES_AJUSTES: ClaveAjuste[] = (() => {
  const vistas = new Set<string>();
  const salidas: ClaveAjuste[] = [];
  for (const entrada of REGISTRO_AJUSTES) {
    const id = idCanonicaAjuste(entrada.id);
    if (!id || vistas.has(id)) continue;
    vistas.add(id);
    salidas.push({ clave: `ajuste:${id}`, id: entrada.id, label: entrada.label, fuente: entrada.fuente });
  }
  return salidas;
})();

/** Todas las claves de ajustes de los dos registros, ya validadas. */
export function clavesDeAjustes(): ClaveAjuste[] {
  return [...CLAVES_AJUSTES];
}

/**
 * Clave `ajuste:` de un ajuste concreto por su id (buscador o lienzo). La
 * búsqueda no distingue mayúsculas: `displacementScale` y `DISPleamentscale`
 * dan la misma clave. Si el ajuste no está en el registro, null — degrada
 * en silencio, sin inventar claves.
 */
export function claveDeAjuste(id: string): ClaveElemento | null {
  const canonico = idCanonicaAjuste(id);
  if (!canonico) return null;
  const hallado = CLAVES_AJUSTES.find((c) => c.clave === `ajuste:${canonico}`);
  return hallado ? hallado.clave : null;
}

/**
 * Atributos DOM para un ajuste: `{ "data-ss-elemento": <clave> }`, o un
 * objeto vacío si no hay clave, para expandirlo en JSX sin guardas:
 * `<div {...atributosDeAjuste("displacementScale")} />`.
 */
export function atributosDeAjuste(id: string): Record<string, string> {
  const clave = claveDeAjuste(id);
  return clave ? { "data-ss-elemento": clave } : {};
}

