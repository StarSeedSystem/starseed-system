// publicar-seguro — muro contra la fuga de datos al publicar desde la Biblioteca.
// -----------------------------------------------------------------------
// Dos fugas históricas, cerradas aquí:
//   1. El Finder de Bibliotecas navegaba a /publish con el objeto COMPLETO del
//      ítem en la querystring (window.location.assign(`/publish?attach=<json>`)):
//      el navegador guarda la URL completa en el historial y los servidores la
//      registran en los logs. Ahora el payload viaja por sessionStorage (una
//      sola lectura y se limpia) y en la URL solo queda un flag.
//   2. `coverFor` (Intercambio de Recursos) construía portadas con
//      placehold.co: cada título de ítem que aún no tenía imagen se enviaba a
//      un tercero en la querystring de un PNG. Ahora la portada es un SVG de
//      datos generado en local, determinista y sin peticiones.
// Módulo puro y compartible: sin "use client", sin Supabase, sin node:*.

/** Clave de sessionStorage para el adjunto de publicación (un solo uso). */
export const PUBLISH_ATTACH_KEY = "starseed.publish.attach.v1";

/** Storage mínimo que necesitan las funciones (inyectable en pruebas). */
export type SessionStorageLike = {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
};

/** Referencia compacta del ítem que se publica (pocos datos, nada sensible). */
export interface PublishAttachRef {
  title?: string;
  url?: string;
  route?: string;
  note?: string;
}

/** href real del adjunto: url externa y luego ruta interna; null si no hay. */
export function hrefDeAdjunto(ref: PublishAttachRef): string | null {
  const href = (ref.url || ref.route || "").trim();
  return href || null;
}

/** Deja el adjunto preparado para /publish (sessionStorage) y devuelve la ruta con el flag. */
export function stagePublishAttach(
  storage: SessionStorageLike | null,
  ref: PublishAttachRef,
): string {
  try {
    if (storage && hrefDeAdjunto(ref)) {
      storage.setItem(PUBLISH_ATTACH_KEY, JSON.stringify(ref));
    }
  } catch {
    /* cuota o modo privado: /publish abrirá sin adjunto, nunca lanza */
  }
  return "/publish?ref=1";
}

/** Lee el adjunto una sola vez (lo limpia); null si no hay o si es inválido. */
export function readPublishAttach(storage: SessionStorageLike | null): PublishAttachRef | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(PUBLISH_ATTACH_KEY);
    if (!raw) return null;
    storage.removeItem(PUBLISH_ATTACH_KEY);
    const parsed = JSON.parse(raw) as PublishAttachRef;
    if (!parsed || typeof parsed !== "object") return null;
    if (!hrefDeAdjunto(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Borra la clave sin decodificarla (para peticiones descartadas). */
export function limpiarAttachPublicacion(storage: SessionStorageLike | null): void {
  try {
    storage?.removeItem(PUBLISH_ATTACH_KEY);
  } catch {
    /* nunca lanza */
  }
}

/** Wrapper del navegador: sessionStorage global con guardia SSR (nunca lanza). */
export function stagePublishAttachEnvironment(ref: PublishAttachRef): string {
  const storage =
    typeof window !== "undefined" && "sessionStorage" in window ? window.sessionStorage : null;
  return stagePublishAttach(storage, ref);
}

/** Wrapper del navegador para leer el adjunto (una sola lectura, ya limpia). */
export function readPublishAttachEnvironment(): PublishAttachRef | null {
  const storage =
    typeof window !== "undefined" && "sessionStorage" in window ? window.sessionStorage : null;
  return readPublishAttach(storage);
}

/* ── Portadas locales (SVG de datos): nada sale del proyecto ── */

/** Par [fondo, tinta] por categoría (mismos tonos que la paleta histórica). */
const PALETAS: Record<string, [string, string]> = {
  app: ["#4C1D95", "#E0E7FF"],
  widget: ["#1E3A8A", "#DBEAFE"],
  tema: ["#9F1239", "#FFE4E6"],
  plantilla: ["#065F46", "#D1FAE5"],
  personalidad: ["#78350F", "#FEF3C7"],
  cerebro: ["#0C4A6E", "#E0F2FE"],
  recurso: ["#3730A3", "#E0E7FF"],
  calendario: ["#115E59", "#CCFBF1"],
};
const PALETA_DEFECTO: [string, string] = ["#1F2937", "#E5E7EB"];

/** Par de colores de la categoría; desconocidos caen en el tono neutro. */
export function colorDeCategoria(categoria: string): [string, string] {
  return PALETAS[categoria] ?? PALETA_DEFECTO;
}

/** Primera letra segura (A–Z, 0–9) del título; ✦ si no hay ninguna válida. */
export function inicialDeTitulo(titulo: string): string {
  const encaje = titulo.trim().toUpperCase().match(/[A-Z0-9]/);
  return encaje ? encaje[0] : "✦";
}

/** Portada determinista: SVG con vesica piscis sutil y la inicial del título. */
export function portadaLocal(categoria: string, titulo: string): string {
  const [bg, fg] = colorDeCategoria(categoria);
  const inicial = inicialDeTitulo(titulo);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'>` +
    `<rect width='400' height='300' fill='${bg}'/>` +
    `<circle cx='140' cy='150' r='80' fill='#FFFFFF' opacity='0.08'/>` +
    `<circle cx='260' cy='150' r='80' fill='#FFFFFF' opacity='0.08'/>` +
    `<text x='200' y='150' font-size='96' fill='${fg}' text-anchor='middle' ` +
    `dominant-baseline='central' font-family='sans-serif'>${inicial}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${svg.replace(/#/g, "%23")}`;
}



