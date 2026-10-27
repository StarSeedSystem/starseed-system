/**
 * Protomolécula · Átomo «video-html»: una composición HyperFrames como un átomo más (HFR1018D).
 * Entra texto, imágenes, audio, vídeo, datos o la voz de Astraura; sale vídeo o fotogramas. El render
 * se planifica con argumentos en lista (nunca por shell) para el servicio local de la neurona.
 * Sin GSAP: la plantilla y las animaciones del OS son CSS/WAAPI (architecture/video-hyperframes.md §2).
 * Contrato: architecture/video-hyperframes.md §4.1 (y protomolecula.md §11.1).
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";

export const DURACION_MIN = 1;
export const DURACION_MAX = 600;
export const RESOLUCIONES = ["landscape", "portrait", "square", "4k"] as const;
export const FPS = ["24", "25", "30", "60"] as const;
export const CALIDADES = ["draft", "looks", "delivery"] as const;
export const FORMATOS = ["mp4", "webm", "mov", "gif", "hls"] as const;

/** La telemetría de HyperFrames viaja apagada SIEMPRE; quien ejecute el plan la pasa al proceso. */
export const ENTORNO_RENDER: Readonly<Record<string, string>> = { HYPERFRAMES_NO_TELEMETRY: "1" };

/** Valores de las variables de la composición, indexados por su id. */
export type VariablesRender = Record<string, ValorParametro>;
/** Lo que `planRender` acepta: valores vivos del átomo y, si vienen, las variables ya resueltas. */
export type ValoresRender = Record<string, ValorParametro | VariablesRender | undefined>;

export const VIDEO_HTML: DefinicionAtomo = {
  herramientaId: "hyperframes",
  nombre: "Vídeo HTML (HyperFrames)",
  categoria: "video",
  integracion: "servicio-local",
  control: "total",
  parametros: [
    { id: "duracion", nombre: "Duración", tipo: "numero", min: DURACION_MIN, max: DURACION_MAX, paso: 1, unidad: "s", defecto: 10, sinonimos: ["duración", "segundos", "largo"] },
    { id: "resolucion", nombre: "Resolución", tipo: "opcion", opciones: [...RESOLUCIONES], defecto: "landscape", sinonimos: ["orientación", "formato de pantalla"] },
    { id: "fps", nombre: "Fotogramas por segundo", tipo: "opcion", opciones: [...FPS], defecto: "30", sinonimos: ["fps", "cadencia"] },
    { id: "calidad", nombre: "Calidad", tipo: "opcion", opciones: [...CALIDADES], defecto: "draft", sinonimos: ["acabado", "quality"] },
    { id: "formato", nombre: "Formato", tipo: "opcion", opciones: [...FORMATOS], defecto: "mp4", sinonimos: ["extensión", "salida"] },
    { id: "variables", nombre: "Variables", tipo: "opcion", opciones: ["ninguna", "json"], defecto: "ninguna", sinonimos: ["variables de la composición", "parámetros de la plantilla"] },
  ],
  entradas: ["texto", "imagen", "audio", "video", "datos", "voz"],
  salidas: ["mp4", "webm", "mov", "gif", "hls", "png-sequence", "fotogramas"],
  ficha: {
    web: "https://hyperframes.heygen.com",
    repo: "https://github.com/heygen-com/hyperframes",
    licencia: "Apache-2.0",
  },
};

/** Una opción válida o la de por defecto; un valor raro nunca viaja al proceso. */
function opcionDe<T extends string>(valor: unknown, opciones: readonly T[], defecto: T): T {
  return typeof valor === "string" && (opciones as readonly string[]).includes(valor) ? (valor as T) : defecto;
}

function numeroDe(valor: unknown): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : Number.NaN;
  if (typeof valor === "string" && valor.trim() !== "") return Number(valor);
  return Number.NaN;
}

/** Duración en segundos: acota a 1–600 y redondea a una décima; un valor roto vuelve al defecto. */
function duracionDe(valor: unknown): number {
  const n = numeroDe(valor);
  if (!Number.isFinite(n)) return 10;
  return Math.min(DURACION_MAX, Math.max(DURACION_MIN, Math.round(n * 10) / 10));
}

/** Variables de la composición: objeto ya resuelto o JSON en texto; vacío, roto o «ninguna» no viaja. */
function variablesDe(valor: unknown): VariablesRender | null {
  if (typeof valor === "string") {
    const texto = valor.trim();
    if (!texto || texto === "ninguna" || texto === "json") return null;
    try { return variablesDe(JSON.parse(texto) as unknown); } catch { return null; }
  }
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const salida: VariablesRender = {};
  for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") salida[clave] = v;
  }
  return Object.keys(salida).length ? salida : null;
}

/**
 * Plan del render de HyperFrames. PURO: misma entrada, mismos argumentos; no ejecuta nada ni toca disco.
 * La lista se entrega tal cual al lanzador sin shell, de modo que ningún valor se interpreta como orden.
 */
export function planRender(valores: ValoresRender = {}): string[] {
  const duracion = duracionDe(valores.duracion);
  const resolucion = opcionDe(valores.resolucion, RESOLUCIONES, "landscape");
  const fps = opcionDe(valores.fps, FPS, "30");
  const calidad = opcionDe(valores.calidad, CALIDADES, "draft");
  const formato = opcionDe(valores.formato, FORMATOS, "mp4");
  const variables = variablesDe(valores.variables);
  const args = [
    "render",
    "--duration", String(duracion),
    "--resolution", resolucion,
    "--fps", fps,
    "--quality", calidad,
    "--format", formato,
  ];
  if (variables) args.push("--variables", JSON.stringify(variables));
  return args;
}
