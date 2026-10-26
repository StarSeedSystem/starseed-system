/**
 * Protomolécula · Átomo "video-html" de HyperFrames (HFR1018D · Ola 1018H · Vídeo con HyperFrames).
 * Editor propio sin GSAP, render en la malla y edición en grupo.
 * Contrato: architecture/video-hyperframes.md §1-§7, §11.1.
 *
 * Integrar HyperFrames (Apache-2.0) en el OS: un átomo que genera vídeo HTML (composición HyperFrames).
 * Servicio "hyperframes" en cada neurona con Node 22, FFmpeg, Chrome headless, telemetría apagada.
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";

/** Valores estándar de resolución (ancho × alto). Los mapas de hiperparámetros del servidor del OS se derivan
   * de los default-files de HyperFrames (ver hyperframes init --help). Los nombres son literales de las opciones de CLI.
   */
const RESOLUCIONES: Record<string, string> = {
  landscape: "1920x1080",
  portrait: "1080x1920",
  square: "1080x1080",
  "4k": "3840x2160",
};

/** Configuración estándar de fotogramas por segundo de HyperFrames (opciones puras de CLI). */
const FPS: Record<string, string> = { 24: "24", 25: "25", 30: "30", 60: "60" };

/** Calidades estándar del CLI (`--quality` de hyperframes render). */
const CALIDADES: Record<string, string> = { draft: "draft", looks: "looks", delivery: "delivery" };

/** Formatos estándar (`--format` de hyperframes render). */
const FORMATOS: Record<string, string> = { mp4: "mp4", webm: "webm", mov: "mov", gif: "gif", hls: "hls" };

/** ¿Anclar al tiempo de hiperparámetros de la sesión? Por defecto, HyperFrames cierra su propia composición
   * con la hora del hiperparámetro activo; si quieres que un vídeo lo siga sin recortar, deja esta opción activa.
   */
const ANCLAR_HORA = true;

export const VIDEO_HTML: DefinicionAtomo = {
  herramientaId: "hyperframes",
  nombre: "Vídeo HTML (HyperFrames)",
  categoria: "video",
  integracion: "servicio-local",
  control: "total",
  parametros: [
    { id: "duracion", nombre: "Duración", tipo: "numero", min: 1, max: 600, paso: 1, unidad: "s", defecto: 30, sinonimos: ["tiempo", "longitud"] },
    { id: "resolucion", nombre: "Resolución", tipo: "opcion", opciones: Object.keys(RESOLUCIONES), defecto: "landscape", sinonimos: ["imagen", "ancho-alto"] },
    { id: "fps", nombre: "Fotogramas por segundo", tipo: "opcion", opciones: Object.keys(FPS), defecto: "30", sinonimos: ["velocidad de fotogramas", "cuadros"] },
    { id: "calidad", nombre: "Calidad", tipo: "opcion", opciones: Object.keys(CALIDADES), defecto: "looks", sinonimos: ["quality", "rendimiento"] },
    { id: "formato", nombre: "Formato", tipo: "opcion", opciones: Object.keys(FORMATOS), defecto: "mp4", sinonimos: ["video", "tipo de archivo"] },
    { id: "variables", nombre: "Variables", tipo: "disparo", defecto: false, sinonimos: ["variables", "entorno"] },
  ],
  entradas: ["texto", "imagen", "audio", "vídeo", "datos", "voz"],
  salidas: ["vídeo", "fotogramas"],
  ficha: {
    web: "https://github.com/heygen-com/hyperframes",
    repo: "https://github.com/heygen-com/hyperframes",
    licencia: "Apache-2.0",
  },
};

/** Valida los valores clave, mapea las claves puras de HyperFrames al orden estricto que espera la CLI.
   * Devuelve un array puro (sin shell): cada elemento es un fragmento de `--key value` para hyperframes render.
   * Nunca ejecuta nada; solo construye las cadenas para `hyperframes render` con la sintaxis --worker --variable...
   */
export function planRender(valores: Record<string, unknown>): string[] {
  const args: string[] = [];

  // duración → --duration {n}
  const duracion = typeof valores.duracion === "number" ? valores.duracion : VIDEO_HTML.parametros.find((p) => p.id === "duracion")?.defecto as number;
  if (typeof duracion === "number" && duracion >= 1 && duracion <= 600) args.push("--duration", String(duracion));

  // resolución → --resolution {ancho}x{alto}
  const resol = typeof valores.resolucion === "string" ? valores.resolucion : VIDEO_HTML.parametros.find((p) => p.id === "resolucion")?.defecto as string;
  const resolKey = Object.keys(RESOLUCIONES).find((k) => k === resol) ?? "landscape";
  const resolValue = RESOLUCIONES[resolKey];
  if (resolValue) args.push("--resolution", resolValue);

  // fps → --fps {num}
  const fpsKey = typeof valores.fps === "string" ? valores.fps : VIDEO_HTML.parametros.find((p) => p.id === "fps")?.defecto as string;
  const fpsValue = FPS[fpsKey];
  if (fpsValue) args.push("--fps", fpsValue);

  // calidad → --quality {draft|looks|delivery}
  const calKey = typeof valores.calidad === "string" ? valores.calidad : VIDEO_HTML.parametros.find((p) => p.id === "calidad")?.defecto as string;
  const calValue = CALIDADES[calKey];
  if (calValue) args.push("--quality", calValue);

  // formato → --format {mp4|webm|mov|gif|hls}
  const fmtKey = typeof valores.formato === "string" ? valores.formato : VIDEO_HTML.parametros.find((p) => p.id === "formato")?.defecto as string;
  const fmtValue = FORMATOS[fmtKey];
  if (fmtValue) args.push("--format", fmtValue);

  // variables del hiperparámetro → --variable name=value
  if (typeof valores.variables === "boolean" && valores.variables) {
    args.push("--variable", "timeAnchored=true");
    if (ANCLAR_HORA) args.push("--variable", `anchorHour=${ANCLAR_HORA}`);
  }

  return args;
}