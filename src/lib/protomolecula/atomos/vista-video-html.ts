import { ATOMO_VIDEO_HTML } from "@/lib/protomolecula/bloque-protomolecula";

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

export const VIDEO_HTML: DefinicionAtomo = {
  herramientaId: ATOMO_VIDEO_HTML,
  nombre: "Vídeo con HyperFrames",
  categoria: "video",
  integracion: "servicio-local",
  control: "total",
  vista: vistaDeLaFicha ? { tipo: "componente", id: vistaDeLaFicha } : undefined,
  parametros: [
    { id: "duracion", nombre: "Duración", tipo: "numero", min: 1, max: 600, paso: 1, unidad: "s", defecto: 3, sinonimos: ["tiempo", "seconds"] },
    { id: "resolucion", nombre: "Resolución", tipo: "opcion", opciones: ["landscape", "portrait", "square", "4k"], defecto: "landscape", sinonimos: ["tamaño", "aspecto"] },
    { id: "fps", nombre: "Fotogramas por segundo", tipo: "opcion", opciones: ["24", "25", "30", "60"], defecto: "24", sinonimos: ["frames", "velocidad"] },
    { id: "calidad", nombre: "Calidad", tipo: "opcion", opciones: ["draft", "looks", "delivery"], defecto: "delivery", sinonimos: ["modo"] },
    { id: "formato", nombre: "Formato", tipo: "opcion", opciones: ["mp4", "webm", "mov", "gif", "hls"], defecto: "mp4", sinonimos: ["tipo"] },
    { id: "variables", nombre: "Variables", tipo: "numero", min: 0, max: 1000, paso: 1, unidad: "", defecto: 0, sinonimos: ["variables de plantilla"] },
  ],
  entradas: ["texto", "imagen", "audio", "vídeo", "datos", "voz"],
  salidas: ["vídeo", "fotogramas"],
  ficha: {
    web: "https://github.com/heygen-com/hyperframes",
    licencia: "Apache-2.0",
  },
};