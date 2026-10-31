import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";

export const VISTA_POR_ATOMO: Record<string, string> = {
  "video-html": "video-html",
  "hyperframes": "video-html",
};

export interface DatosVideo {
  poster: string | null;
  render: string | null;
}

const URL_SEGURA = /^(https?:)?\/\//i;
const RUTA_PROPIA = /^\//;
const DATA_URL = /^data:/i;

function esCadenaSegura(u: unknown): u is string {
  if (typeof u !== "string") return false;
  return URL_SEGURA.test(u) || RUTA_PROPIA.test(u) || DATA_URL.test(u);
}

export function datosDe(input: { poster?: unknown; render?: unknown; renderHecho?: boolean } | null): DatosVideo {
  const poster = esCadenaSegura(input?.poster) ? input.poster : null;
  const render = esCadenaSegura(input?.render) ? input.render : null;
  return { poster, render };
}

export function conRender(poster?: string): DatosVideo {
  const p = poster && esCadenaSegura(poster) ? poster : null;
  return { poster: p, render: p ? "/renderado.mp4" : "/renderado.mp4" };
}

export function soloPoster(): DatosVideo {
  return { poster: "/media/p.png", render: null };
}

export type Vista = "video-html" | "video-html-poster" | "video-html-render" | "video-html-render-vivo" | "video-html-poster-only" | "video-html-empty" | "render" | "vivo" | "poster" | "vacio";

export function elegirVista(
  atomo: DatosVideo | null,
  servicio: boolean,
  hecho: boolean
): "render" | "vivo" | "poster" | "vacio" {
  if (atomo?.render != null) return "render";
  if (atomo?.poster != null) {
    if (hecho) return "poster";
    if (servicio) return "vivo";
    return "poster";
  }
  if (atomo === null || (atomo.poster === null && atomo.render === null)) {
    if (servicio) return "vivo";
    if (hecho) return "vivo";
    return "vacio";
  }
  return "vacio";
}