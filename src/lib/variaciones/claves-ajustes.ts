/**
 * Variaciones públicas · claves de los Ajustes. Una clave `ajuste:<id>` nombra el
 * TIPO de ajuste (todas comparten `ajuste:tema-apariencia`), nunca la instancia ni
 * dato privado. Fuentes: `SETTINGS_SEARCH_INDEX` (buscador de /ajustes) y
 * `SETTINGS_INDEX` (lienzo de diseño). Módulo PURO: sin red, disco, `node:*` ni
 * DOM, con las fuentes inyectables para que la prueba no dependa de lo vivo.
 * Contrato: architecture/variaciones-publicas.md §2 y §7 (bloque W).
 */
import { SETTINGS_SEARCH_INDEX } from "@/components/settings/settings-search";
import { SETTINGS_INDEX } from "@/components/design-canvas/settings-index";
import { leerClave, type ClaveElemento } from "./clave-elemento";

/** De qué índice sale la clave, para poder depurar y probar cada fuente. */
export type OrigenAjuste = "busqueda" | "ajustes";

/** Forma mínima de una entrada de los índices de Ajustes (lo justo para la clave). */
export interface EntradaAjuste {
  id: string;
  tab: string;
  keywords?: readonly string[];
  category?: string;
  anchor?: string;
}

export interface FuentesAjustes {
  busqueda?: readonly EntradaAjuste[];
  ajustes?: readonly EntradaAjuste[];
}

/** Clave de un ajuste, lista para envolver su panel con `<ConClave>`. */
export interface ClaveAjuste {
  /** id canónico en kebab-case (sin acentos, sin mayúsculas). */
  id: string;
  clave: ClaveElemento;
  /** pestaña real de Ajustes (`appearance`, `ai`, `effects`…) y su grupo en español. */
  pestana: string;
  grupo: string;
  /** ancla del DOM de la sección, si la fuente la declara. */
  ancla?: string;
  palabras: string[];
  origen: OrigenAjuste;
}

const GRUPOS_POR_PESTANA: Record<string, string> = {
  effects: "Efectos y física",
  components: "Componentes",
  generative: "Generativo",
  colors: "Colores",
  typography: "Tipografía",
};

const FUENTES: FuentesAjustes = {
  busqueda: SETTINGS_SEARCH_INDEX,
  ajustes: SETTINGS_INDEX,
};

/** Sanea el id a la forma canónica (`fontMain` → `font-main`, «Tipografía» → `tipografia`); vacío si no queda nada útil. */
export function normalizarIdAjuste(entrada: string): string {
  return entrada
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Clave `ajuste:<id>` de un id suelto, o null si al sanearlo no queda nada válido. */
export function claveDeAjuste(id: string): ClaveElemento | null {
  const limpio = normalizarIdAjuste(id);
  if (!limpio) return null;
  return leerClave(`ajuste:${limpio}`);
}

/**
 * Claves de todos los Ajustes (buscador de /ajustes y lienzo de diseño), sin
 * repetidos; una entrada sin id válido se descarta sin inventar claves.
 */
export function clavesDeAjustes(fuentes: FuentesAjustes = FUENTES): ClaveElemento[] {
  return detallesDeAjustes(fuentes).map((ajuste) => ajuste.clave);
}

/** Igual que `clavesDeAjustes`, con pestaña, grupo, ancla y palabras de cada una. */
export function detallesDeAjustes(fuentes: FuentesAjustes = FUENTES): ClaveAjuste[] {
  const claves = new Map<ClaveElemento, ClaveAjuste>();
  const anadir = (entradas: readonly EntradaAjuste[] | undefined, origen: OrigenAjuste) => {
    for (const entrada of entradas ?? []) {
      const limpio = normalizarIdAjuste(entrada.id);
      const clave = limpio ? leerClave(`ajuste:${limpio}`) : null;
      if (!clave || claves.has(clave)) continue;
      const grupo = entrada.category ?? GRUPOS_POR_PESTANA[entrada.tab] ?? entrada.tab;
      claves.set(clave, {
        id: limpio,
        clave,
        pestana: entrada.tab,
        grupo,
        ...(entrada.anchor ? { ancla: entrada.anchor } : {}),
        palabras: [...(entrada.keywords ?? [])],
        origen,
      });
    }
  };
  anadir(fuentes.busqueda, "busqueda");
  anadir(fuentes.ajustes, "ajustes");
  return [...claves.values()];
}

/** Índice por id canónico, para que cada panel encuentre su clave sin recorrer la lista. */
export function indiceDeAjustes(fuentes: FuentesAjustes = FUENTES): Map<string, ClaveAjuste> {
  return new Map(detallesDeAjustes(fuentes).map((ajuste) => [ajuste.id, ajuste]));
}

/** Clave del ajuste que vive en un ancla real del DOM (útil para las secciones de /cuenta). */
export function claveDeAjustePorAncla(
  ancla: string,
  fuentes: FuentesAjustes = FUENTES,
): ClaveElemento | null {
  if (!ancla) return null;
  return detallesDeAjustes(fuentes).find((ajuste) => ajuste.ancla === ancla)?.clave ?? null;
}
