/**
 * Variaciones públicas · claves de Ajustes (Ola 1019V · tarea W).
 * ---------------------------------------------------------------------------
 * Genera las claves canónicas `ajuste:<id>` de los paneles de Ajustes desde
 * los dos registros que ya existen y tienen id estable: `SETTINGS_SEARCH_INDEX`
 * (buscador global de /ajustes) y `SETTINGS_INDEX` (ajustes del lienzo), para
 * que cada panel las use con `<ConClave>` y el clic derecho reconozca el
 * ajuste. Así ninguna pantalla de Ajustes inventa su propia clave.
 *
 * Módulo PURO: sin red, sin disco, sin `node:*` y sin DOM; de los índices
 * solo se LEEN sus entradas estáticas (las interfaces de usuario no se
 * ejecutan aquí). Los ids camelCase del lienzo se canonizan a kebab-case
 * para que la clave pase `leerClave` el formato canónico del contrato.
 *
 * Contrato: architecture/variaciones-publicas.md §2.
 */
import { SETTINGS_SEARCH_INDEX } from "@/components/settings/settings-search";
import { SETTINGS_INDEX } from "@/components/design-canvas/settings-index";
import { leerClave, type ClaveElemento } from "./clave-elemento";

/**
 * Canoniza un id de ajuste al tramo que exige el formato canónico:
 * `displacementScale` → `displacement-scale`, `stitch-prompt` queda igual.
 * Sin contenido útil tras el canon, devuelve null.
 */
export function idCanonicoDeAjuste(id: string): string | null {
  const canonico = id
    .trim()
    // camelCase → kebab-case, antes de bajar a minúsculas
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    // cualquier otro separador (espacio, guion bajo…) también es un guion
    .replace(/[^a-zA-Z0-9.]+/g, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return canonico || null;
}

/** ¿Conoce alguno de los dos índices de Ajustes ese id canónico? */
export function esAjusteRegistrado(idCanonico: string): boolean {
  return (
    SETTINGS_SEARCH_INDEX.some((e) => idCanonicoDeAjuste(e.id) === idCanonico) ||
    SETTINGS_INDEX.some((e) => idCanonicoDeAjuste(e.id) === idCanonico)
  );
}

/**
 * Clave canónica `ajuste:<id>` de un ajuste: null si el id está vacío, no
 * vive en ningún índice o su clave no pasa `leerClave`. Un id camelCase se
 * acepta en su forma canonizada, de modo que un panel puede pedir la clave
 * con el id de su registro exacto («displacementScale»).
 */
export function claveDeAjuste(id: string): ClaveElemento | null {
  const canonico = idCanonicoDeAjuste(id);
  if (!canonico || !esAjusteRegistrado(canonico)) return null;
  const clave: ClaveElemento = `ajuste:${canonico}`;
  return leerClave(clave) ? clave : null;
}

/**
 * Todas las claves `ajuste:` de los dos índices, una por id canonizado y
 * sin duplicados: primero el buscador de Ajustes y luego el del lienzo.
 * Es la lista que alimentan los paneles y la ventana «Variaciones públicas».
 */
export function clavesDeAjustes(): ClaveElemento[] {
  const claves: ClaveElemento[] = [];
  const vistas = new Set<string>();
  for (const entrada of [...SETTINGS_SEARCH_INDEX, ...SETTINGS_INDEX]) {
    const clave = claveDeAjuste(entrada.id);
    if (clave && !vistas.has(clave)) {
      vistas.add(clave);
      claves.push(clave);
    }
  }
  return claves;
}

