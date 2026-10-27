/**
 * Variaciones públicas · claves de Ajustes. Genera las claves canónicas
 * `ajuste:<pestaña>.<id>` (con parte `#<ancla>` cuando el índice declara
 * sección o ancla) desde `SETTINGS_SEARCH_INDEX` y `SETTINGS_INDEX`, para que
 * cada panel de Ajustes las ponga en el DOM vía `<ConClave>`.
 *
 * Los id en camelCase de los índices (p. ej. `displacementScale`) se
 * normalizan a kebab-case: la clave debe pasar `leerClave` (§2 del contrato;
 * el ejemplo canónico es `ajuste:apariencia.radio`).
 *
 * Módulo PURO: sin red, sin disco, sin `node:*`, sin DOM. Solo traduce
 * registros ya existentes en claves públicas compartidas.
 *
 * Contrato: architecture/variaciones-publicas.md §2.
 */
import { SETTINGS_SEARCH_INDEX } from "@/components/settings/settings-search";
import { SETTINGS_INDEX } from "@/components/design-canvas/settings-index";
import { crearClave, leerClave, type ClaveElemento } from "./clave-elemento";

/** Un ajuste del índice con su clave pública resuelta. */
export interface AjusteConClave {
  /** Clave canónica, ya validada con `leerClave`. */
  clave: ClaveElemento;
  /** Etiqueta legible en el índice. */
  etiqueta: string;
  /** Pestaña de Ajustes a la que pertenece. */
  pestaña: string;
}

/** Convierte un id de índice (camelCase o kebab) a kebab-case minúscula. */
export function normalizarIdAjuste(id: string): string {
  const kebab = id
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9.]+/g, "-")
    .toLowerCase();
  return kebab.startsWith(".") || kebab.startsWith("-") ? kebab.replace(/^-+/, "") : kebab;
}

/**
 * Clave de un ajuste a partir de su pestaña e id del índice. `parte` es la
 * sección o ancla del DOM (opcional). Devuelve null si falta algo esencial o
 * la clave resultante falla `leerClave`: sin ajuste registrado no hay clave,
 * degrada en silencio y nunca inventa una.
 */
export function claveDeAjuste(
  pestaña: string,
  id: string,
  parte?: string
): ClaveElemento | null {
  if (!pestaña || !id) return null;
  const parteNormalizada = parte ? normalizarIdAjuste(parte) : undefined;
  const clave = crearClave("ajuste", `${normalizarIdAjuste(pestaña)}.${normalizarIdAjuste(id)}`, parteNormalizada);
  return leerClave(clave) ? clave : null;
}

/** Parte del DOM (ancla o sección) declarada por un ajuste, si la hay. */
function parteDeAjuste(sección?: string, ancla?: string): string | undefined {
  return sección ?? ancla ?? undefined;
}

/**
 * Recorre ambos índices de Ajustes y devuelve una lista deduplicada de
 * ajustes con su clave pública y datos para la ventana de variaciones.
 * Van primero las entradas de `SETTINGS_SEARCH_INDEX` (catálogo de Ajustes)
 * y después las de `SETTINGS_INDEX` (ajustes de diseño); si ambas comparten
 * clave, manda la primera y no se duplica.
 */
export function clavesDeAjustes(): AjusteConClave[] {
  const porClave = new Map<string, AjusteConClave>();
  for (const entrada of SETTINGS_SEARCH_INDEX) {
    const clave = claveDeAjuste(entrada.tab, entrada.id, entrada.anchor);
    if (clave && !porClave.has(clave)) {
      porClave.set(clave, { clave, etiqueta: entrada.label, pestaña: entrada.tab });
    }
  }
  for (const item of SETTINGS_INDEX) {
    const clave = claveDeAjuste(item.tab, item.id, item.sectionId);
    if (clave && !porClave.has(clave)) {
      porClave.set(clave, { clave, etiqueta: item.label, pestaña: item.tab });
    }
  }
  return [...porClave.values()];
}
