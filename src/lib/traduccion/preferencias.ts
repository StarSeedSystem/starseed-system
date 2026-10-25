/**
 * preferencias — Traducción por perfil (TRD1020D)
 *
 * Clave sincronizada: `starseed.traduccion.v1` (añádida a SYNCED_KEYS).
 * Preferencias por perfil: idioma de lectura + autotraducción por contexto.
 * Por defecto el idioma lo da quien llama (p. ej. navigator.language) y todo en "preguntar".
 * leer/guardar con try/catch, validación (lo inválido vuelve a valores por defecto).
 * debeTraducir(perfil, contexto, idiomaDelTexto): no traduce si el idioma del texto está en entiende.
 */

export const CLAVE_TRADUCCION = "starseed.traduccion.v1";

export type ModoAutotrad = "nunca" | "preguntar" | "siempre";

export type ContextoTraduccion =
  | "paginas"
  | "mensajes"
  | "publicaciones"
  | "agentes"
  | "astraura";

export interface PreferenciasTraduccion {
  idioma: string;
  entiende: string[];
  auto: Record<ContextoTraduccion, ModoAutotrad>;
}

const CONTEXTOS: ContextoTraduccion[] = [
  "paginas",
  "mensajes",
  "publicaciones",
  "agentes",
  "astraura",
];

const MODOS_VALIDOS: ModoAutotrad[] = ["nunca", "preguntar", "siempre"];

export function obtenerIdiomaPorDefecto(): string {
  try {
    if (typeof navigator !== "undefined" && navigator.language) {
      const lang = navigator.language.trim();
      if (lang) return lang;
    }
  } catch {
    /* ignorar */
  }
  return "es";
}

export function preferenciasPorDefecto(
  idioma?: string,
): PreferenciasTraduccion {
  const lang = (idioma && idioma.trim()) || obtenerIdiomaPorDefecto();
  return {
    idioma: lang,
    entiende: [],
    auto: {
      paginas: "preguntar",
      mensajes: "preguntar",
      publicaciones: "preguntar",
      agentes: "preguntar",
      astraura: "preguntar",
    },
  };
}

function normalizarListaIdiomas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const out: string[] = [];
  const vistos = new Set<string>();
  for (const item of lista) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (!s) continue;
    const clave = s.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(s);
  }
  return out;
}

function normalizarModo(modo: unknown): ModoAutotrad {
  if (typeof modo === "string" && MODOS_VALIDOS.includes(modo as ModoAutotrad)) {
    return modo as ModoAutotrad;
  }
  return "preguntar";
}

export function sanearPreferencias(
  crudo: unknown,
  idiomaPorDefecto?: string,
): PreferenciasTraduccion {
  const base = preferenciasPorDefecto(idiomaPorDefecto);
  if (typeof crudo !== "object" || crudo === null) {
    return {
      idioma: base.idioma,
      entiende: [],
      auto: { ...base.auto },
    };
  }
  const o = crudo as Record<string, unknown>;
  const idioma =
    typeof o.idioma === "string" && o.idioma.trim()
      ? o.idioma.trim()
      : base.idioma;
  const entiende = normalizarListaIdiomas(o.entiende);
  const autoCrudo =
    typeof o.auto === "object" && o.auto !== null
      ? (o.auto as Record<string, unknown>)
      : {};
  const auto: Record<ContextoTraduccion, ModoAutotrad> = { ...base.auto };
  for (const ctx of CONTEXTOS) {
    auto[ctx] = normalizarModo(autoCrudo[ctx]);
  }
  return { idioma, entiende, auto };
}

export function leerPreferencias(
  idiomaPorDefecto?: string,
): PreferenciasTraduccion {
  try {
    if (typeof window === "undefined") {
      return sanearPreferencias(null, idiomaPorDefecto);
    }
    const txt = window.localStorage.getItem(CLAVE_TRADUCCION);
    if (!txt) return sanearPreferencias(null, idiomaPorDefecto);
    return sanearPreferencias(JSON.parse(txt), idiomaPorDefecto);
  } catch {
    return sanearPreferencias(null, idiomaPorDefecto);
  }
}

export function guardarPreferencias(perfil: PreferenciasTraduccion): void {
  try {
    if (typeof window === "undefined") return;
    const saneado = sanearPreferencias(perfil);
    window.localStorage.setItem(CLAVE_TRADUCCION, JSON.stringify(saneado));
  } catch {
    /* ignorar */
  }
}

function normalizarCodigoIdioma(codigo: string): string {
  const s = codigo.trim().toLowerCase();
  if (!s) return "";
  // coger parte principal antes de '-' o '_'
  const base = s.split(/[-_]/)[0];
  return base || s;
}

export function debeTraducir(
  perfil: PreferenciasTraduccion,
  contexto: ContextoTraduccion,
  idiomaDelTexto: string,
): boolean {
  const saneado = sanearPreferencias(perfil);
  const modo = saneado.auto[contexto];
  if (modo === "nunca") return false;
  if (!idiomaDelTexto || !idiomaDelTexto.trim()) {
    // Si no sabemos el idioma, no decidimos forzar "no traducir" por lista de entiende;
    // dejamos que el modo decida, pero regla dice "no si el idioma del texto está en entiende"
    if (modo === "siempre") return true;
    return modo === "preguntar" ? false : false;
  }
  const idiomaTextoNorm = normalizarCodigoIdioma(idiomaDelTexto);
  if (!idiomaTextoNorm) {
    if (modo === "siempre") return true;
    return false;
  }
  const entiende = saneado.entiende.map((i) => normalizarCodigoIdioma(i)).filter(Boolean);
  if (entiende.includes(idiomaTextoNorm)) {
    return false;
  }
  if (modo === "siempre") return true;
  if (modo === "preguntar") return false;
  return false;
}
