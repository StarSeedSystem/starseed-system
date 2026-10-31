import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import { ATOMO_VIDEO_HTML, vistaVideoHtmlDe } from "@/lib/protomolecula/bloque-protomolecula";

/** La correspondencia del bloque decide qué vista de componente pinta este átomo (§4.1). */
const vistaDeLaFicha = vistaVideoHtmlDe(ATOMO_VIDEO_HTML);

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

export type ValoresVideoHtml = Record<string, unknown>;

export function planRender(valores: ValoresVideoHtml): string[] {
  const duracion = Number(valores.duracion ?? VIDEO_HTML.parametros.find(p => p.id === "duracion")?.defecto);
  const resolucion = String(valores.resolucion ?? VIDEO_HTML.parametros.find(p => p.id === "resolucion")?.defecto);
  const fps = String(valores.fps ?? VIDEO_HTML.parametros.find(p => p.id === "fps")?.defecto);
  const calidad = String(valores.calidad ?? VIDEO_HTML.parametros.find(p => p.id === "calidad")?.defecto);
  const formato = String(valores.formato ?? VIDEO_HTML.parametros.find(p => p.id === "formato")?.defecto);

  const workers = calidad === "draft" ? "1" : "2";
  const args: string[] = ["render", "--format", formato, "--workers", workers];
  
  const resolucionMap: Record<string, string> = {
    landscape: "1280x720",
    portrait: "720x1280",
    square: "720x720",
    "4k": "3840x2160",
  };
  
  if (resolucionMap[resolucion]) {
    args.push("--size", resolucionMap[resolucion]);
  }
  
  args.push("--fps", fps);
  
  if (duracion > 0 && duracion <= 600) {
    args.push("--duration", String(Math.round(duracion)));
  }
  
  return args;
}
