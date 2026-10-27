/**
 * Protomolécula · Átomo «video-html» (composición HyperFrames). Integración: servicio-local; control: total.
 * Una composición es HTML con tiempos (`data-start`, `data-duration`) y el render lo hace HyperFrames.
 * El plan es PURO: devuelve el argv de `hyperframes render` sin shell, sin disco, sin red y sin reloj.
 * GSAP no entra en el OS (licencia Standard, §2); la telemetría va siempre apagada.
 * Contrato: architecture/video-hyperframes.md §1–§4 (y protomolecula.md §11.1).
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";

const RESOLUCIONES = ["landscape", "portrait", "square", "4k"] as const;
const FPS = ["24", "25", "30", "60"] as const;
const CALIDADES = ["draft", "looks", "delivery"] as const;
const FORMATOS = ["mp4", "webm", "mov", "gif", "hls"] as const;

/** Entorno obligatorio al lanzar la CLI: la telemetría de HyperFrames nunca sale de la neurona. */
export const ENTORNO_RENDER: Readonly<Record<string, string>> = { HYPERFRAMES_NO_TELEMETRY: "1" };

export const VIDEO_HTML: DefinicionAtomo = {
  herramientaId: "hyperframes",
  nombre: "Vídeo HTML (HyperFrames)",
  categoria: "video",
  integracion: "servicio-local",
  control: "total",
  parametros: [
    { id: "duracion", nombre: "Duración", tipo: "numero", min: 1, max: 600, paso: 0.1, unidad: "s", defecto: 10, sinonimos: ["duración del vídeo", "segundos", "largo"] },
    { id: "resolucion", nombre: "Resolución", tipo: "opcion", opciones: [...RESOLUCIONES], defecto: "landscape", sinonimos: ["tamaño", "proporción", "formato de pantalla"] },
    { id: "fps", nombre: "Fotogramas por segundo", tipo: "opcion", opciones: [...FPS], defecto: "30", unidad: "fps", sinonimos: ["fps", "cadencia", "velocidad"] },
    { id: "calidad", nombre: "Calidad", tipo: "opcion", opciones: [...CALIDADES], defecto: "looks", sinonimos: ["calidad de render", "acabado"] },
    { id: "formato", nombre: "Formato", tipo: "opcion", opciones: [...FORMATOS], defecto: "mp4", sinonimos: ["contenedor", "extensión"] },
    { id: "variables", nombre: "Variables", tipo: "opcion", opciones: [], defecto: "{}", sinonimos: ["variables de la composición", "datos"] },
  ],
  entradas: ["texto", "imagen", "audio", "vídeo", "datos", "voz"],
  salidas: ["vídeo", "fotogramas"],
  ficha: { web: "https://hyperframes.heygen.com", repo: "https://github.com/heygen-com/hyperframes", licencia: "Apache-2.0" },
};

function numero(valor: unknown, defecto: number): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : defecto;
}

function acotar(valor: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, valor));
}

function opcion<T extends string>(valor: unknown, validas: readonly T[], defecto: T): T {
  if (typeof valor !== "string" && typeof valor !== "number") return defecto;
  const texto = String(valor);
  return validas.find((v) => v === texto) ?? defecto;
}

/** Las variables llegan como objeto JSON o como su texto; cualquier otra cosa se ignora entera. */
function variablesDe(valor: unknown): Record<string, unknown> {
  if (typeof valor === "string") {
    if (!valor.trim().startsWith("{")) return {};
    try {
      const parseado: unknown = JSON.parse(valor);
      return parseado !== null && typeof parseado === "object" && !Array.isArray(parseado)
        ? { ...(parseado as Record<string, unknown>) }
        : {};
    } catch {
      return {};
    }
  }
  if (valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
    return { ...(valor as Record<string, unknown>) };
  }
  return {};
}

/**
 * Plan de render PURA y determinista: misma entrada, mismo argv. La duración viaja como variable
 * `duracion` (el HTML la lee al montar los clips); el resto son banderas de `hyperframes render`.
 * Nunca se lanza una shell: cada argumento es un elemento más de la lista.
 */
export function planRender(valores: Record<string, unknown> = {}): string[] {
  const duracion = acotar(numero(valores.duracion, 10), 1, 600);
  const resolucion = opcion(valores.resolucion, RESOLUCIONES, "landscape");
  const fps = opcion(valores.fps, FPS, "30");
  const calidad = opcion(valores.calidad, CALIDADES, "looks");
  const formato = opcion(valores.formato, FORMATOS, "mp4");
  const variables = { ...variablesDe(valores.variables), duracion };
  return [
    "render",
    "--format", formato,
    "--fps", fps,
    "--quality", calidad,
    "--resolution", resolucion,
    "--variables", JSON.stringify(variables),
  ];
}
