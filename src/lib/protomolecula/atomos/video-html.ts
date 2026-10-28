/**
 * Protomolécula · Átomo «video-html» — composición HyperFrames (HFR1018D).
 * HTML con atributos de tiempo (data-start, data-duration, class="clip") que se
 * recorre fotograma a fotograma hasta un vídeo determinista (MP4/WebM/MOV/GIF/HLS).
 * Átomo más de la Protomolécula (architecture/video-hyperframes.md §4.1) que se
 * renderiza en una neurona de la malla por el servicio local «hyperframes» (§4.3).
 * El render es un PLAN PURO: los argumentos de `hyperframes render` como lista de
 * tokens, nunca una línea de shell; el servicio los ejecuta. Nunca GSAP (§2) y
 * telemetría SIEMPRE apagada.
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";

/** Tamaño de render de cada proporción, como lo pide `hyperframes render`. */
export const RESOLUCIONES: Record<string, string> = {
  landscape: "1280x720",
  portrait: "720x1280",
  square: "720x720",
  "4k": "3840x2160",
};
/** Fotogramas por segundo que admite el CLI (de la tabla del contrato §1). */
const FPS_OPCIONES: string[] = ["24", "25", "30", "60"];

export const VIDEO_HTML: DefinicionAtomo = {
  herramientaId: "hyperframes",
  nombre: "Vídeo (HyperFrames)",
  categoria: "video",
  integracion: "servicio-local",
  control: "total",
  parametros: [
    { id: "duracion", nombre: "Duración", tipo: "numero", min: 1, max: 600, paso: 1, unidad: "s", defecto: 30, sinonimos: ["duración del vídeo", "tiempo", "largo"] },
    { id: "resolucion", nombre: "Resolución", tipo: "opcion", opciones: Object.keys(RESOLUCIONES), defecto: "landscape", sinonimos: ["proporción", "tamaño", "orientación"] },
    { id: "fps", nombre: "FPS", tipo: "opcion", opciones: FPS_OPCIONES, defecto: "30", sinonimos: ["fotogramas", "fotogramas por segundo"] },
    { id: "calidad", nombre: "Calidad", tipo: "opcion", opciones: ["draft", "looks", "delivery"], defecto: "draft", sinonimos: ["perfil de render", "borrador"] },
    { id: "formato", nombre: "Formato", tipo: "opcion", opciones: ["mp4", "webm", "mov", "gif", "hls"], defecto: "mp4", sinonimos: ["formato de salida", "contenedor"] },
    // Sin opciones fijas a propósito: el valor lo escribe la molécula (datos, dictado…) como
    // texto «clave=valor» separado por comas, y el plan lo trocea en `--variables`.
    { id: "variables", nombre: "Variables", tipo: "opcion", opciones: [], sinonimos: ["variables de composición", "vars"] },
  ],
  entradas: ["texto", "imagen", "audio", "video", "datos", "voz"],
  salidas: ["video", "fotogramas"],
  ficha: {
    web: "https://hyperframes.heygen.com",
    repo: "https://github.com/heygen-com/hyperframes",
    licencia: "Apache-2.0",
  },
};

/** Plan del render: los tokens de `hyperframes render`, lo acotado y los avisos. */
export interface PlanRenderVideo {
  args: string[];
  entorno: Record<string, string>;
  formato: string;
  calidad: string;
  fps: number;
  duracionSegundos: number;
  ancho: number;
  alto: number;
  fotogramas: number;
  variables: Record<string, string>;
  avisos: string[];
}

/** El parámetro `id` tal como lo declara el átomo. */
const param = (id: string) => VIDEO_HTML.parametros.find((p) => p.id === id);

/** El valor numérico acotado al min/max del parámetro; fuera de rango o ausente, el defecto. */
function numeroDe(valores: Record<string, ValorParametro | undefined>, id: string): number {
  const p = param(id), defecto = typeof p?.defecto === "number" ? p.defecto : 0, v = valores?.[id];
  if (typeof v !== "number" || !Number.isFinite(v)) return defecto;
  return Math.max(p?.min ?? defecto, Math.min(p?.max ?? defecto, v));
}

/** El valor como opción de la lista del parámetro; si no está, el defecto. */
function opcionDe(valores: Record<string, ValorParametro | undefined>, id: string): string {
  const v = valores?.[id], p = param(id);
  if (typeof v === "string" && p?.opciones?.includes(v)) return v;
  return String(p?.defecto ?? "");
}

/** Las variables de composición viajan como «clave=valor» separado por comas; lo malformado se descarta con aviso. */
function parsearVariables(texto: ValorParametro | undefined, avisos: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  if (typeof texto !== "string") return vars;
  for (const parte of texto.split(",")) {
    const corte = parte.indexOf("=");
    if (parte.trim() && (corte <= 0 || !parte.slice(0, corte).trim())) {
      avisos.push(`Variable inválida descartada: «${parte.trim()}».`);
      continue;
    }
    if (corte <= 0) continue;
    vars[parte.slice(0, corte).trim()] = parte.slice(corte + 1).trim();
  }
  return vars;
}

/** El plan PURO del render: misma entrada, mismo plan; no ejecuta nada. */
export function planRender(valores: Record<string, ValorParametro | undefined> = {}): PlanRenderVideo {
  const avisos: string[] = [];
  const duracionSegundos = numeroDe(valores, "duracion");
  const formato = opcionDe(valores, "formato");
  const calidad = opcionDe(valores, "calidad");
  const fps = Number(opcionDe(valores, "fps"));
  const resolucion = RESOLUCIONES[opcionDe(valores, "resolucion")] ?? RESOLUCIONES.landscape;
  const ancho = Number(resolucion.split("x")[0]), alto = Number(resolucion.split("x")[1]);
  const variables = parsearVariables(valores["variables"], avisos);
  const args = ["--format", formato, "--quality", calidad, "--fps", String(fps),
    "--resolution", `${ancho}x${alto}`, "--duration", `${duracionSegundos}s`];
  for (const [clave, valor] of Object.entries(variables)) args.push("--variables", `${clave}=${valor}`);
  return {
    args,
    entorno: { HYPERFRAMES_NO_TELEMETRY: "1" }, // telemetría de HyperFrames SIEMPRE fuera (contrato §1)
    formato, calidad, fps, duracionSegundos, ancho, alto,
    fotogramas: Math.round(duracionSegundos * fps),
    variables, avisos,
  };
}
