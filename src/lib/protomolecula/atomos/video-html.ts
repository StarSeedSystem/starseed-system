/**
 * Protomolécula · Átomo vídeo-html (HyperFrames) (F1C · HFR1018D).
 * Integración: iframe-aislado; control: total.
 * Contrato: architecture/protomolecula.md §11.1 y architecture/video-hyperframes.md §1.
 */

import type { DefinicionAtomo, Parametro, VistaProps } from "@/lib/protomolecula/registro-atomos";

/** Parámetros exactos según el contrato del HyperFrames (paquete @hyperframes/core). */
const PARAMETROS: Parametro[] = [
  { id: "duracion", nombre: "Duración", tipo: "numero", min: 1, max: 600, paso: 1, unidad: "s", defecto: 10, sinonimos: ["tiempo", "duración"] },
  {
    id: "resolucion",
    nombre: "Resolución",
    tipo: "opcion",
    opciones: ["landscape", "portrait", "square", "4k"],
    defecto: "landscape",
    sinonimos: ["ancho-alto", "modo", "pixeles"],
  },
  {
    id: "fps",
    nombre: "FPS",
    tipo: "opcion",
    opciones: ["24", "25", "30", "60"],
    defecto: "30",
    sinonimos: ["fotogramas por segundo", "velocidad"],
  },
  {
    id: "calidad",
    nombre: "Calidad",
    tipo: "opcion",
    opciones: ["draft", "looks", "delivery"],
    defecto: "looks",
    sinonimos: ["rendimiento", "imagen"],
  },
  {
    id: "formato",
    nombre: "Formato",
    tipo: "opcion",
    opciones: ["mp4", "webm", "mov", "gif", "hls"],
    defecto: "mp4",
    sinonimos: ["video", "tipo"],
  },
  {
    id: "variables",
    nombre: "Variables",
    tipo: "disparo",
    defecto: false,
    sinonimos: ["configurar", "animaciones"],
  },
];

/** Entradas (contexto) que alimentan la composición. */
const ENTRADAS: string[] = ["texto", "imagen", "audio", "vídeo", "datos", "voz"];

/** Salidas que genera este átomo. */
const SALIDAS: string[] = ["vídeo", "fotogramas"];

/** Función pura que convierte valores en lista para hyperframes render. Siempre es idempotente. */
export function planRender(valores: Record<string, unknown>): string[] {
  const { duracion, resolucion, fps, calidad, formato } = valores as {
    duracion: number;
    resolucion: string;
    fps: string;
    calidad: string;
    formato: string;
  };

  const args: string[] = ["hyperframes", "render", "${input_html}"];

  if (!Number.isFinite(duracion) || duracion < 1 || duracion > 600) {
    args.push("--duracion", "10");
  } else {
    args.push("--duracion", String(duracion));
  }

  args.push("--resolucion", resolucion);
  args.push("--fps", fps);
  args.push("--calidad", calidad);
  args.push("--formato", formato);
  args.push("--no-telemetria");
  return args;
}

export const VIDEO_HTML: DefinicionAtomo = {
  herramientaId: "hyperframes",
  nombre: "Vídeo-HTML (HyperFrames)",
  categoria: "video",
  integracion: "iframe-aislado",
  control: "total",
  parametros: PARAMETROS,
  entradas: ENTRADAS,
  salidas: SALIDAS,
  ficha: {
    web: "https://github.com/heygen-com/hyperframes",
    licencia: "Apache-2.0",
  },
  vista: { tipo: "documento", documento: documentoVideoHTML },
};

/** HTML puro para el iframe (sin GSAP, telemetría apagada, de StarSeed). */
function documentoVideoHTML(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>HyperFrames Vídeo-HTML</title>
<style>
body { font-family: system-ui, sans-serif; background: #0b0b14; color: #e2e8f0; padding: 1.5rem; line-height: 1.5; }
button { cursor: pointer; padding: .6rem 1rem; border-radius: .5rem; border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.08); color: #fff; font: inherit; }
.clippable { cursor: pointer; }
.clippable.selected { outline: 2px solid #38bdf8; }
</style>
</head>
<body>
<h1>Editor de Vídeo HyperFrames (StarSeed)</h1>
<p>Arrastra, selecciona clips con <code>data-start</code>/<code>data-duration</code> y <code>data-track-index</code>. Exporta a MP4/WebM/MOV/GIF/HLS.</p>
<div id="contenedor-editor"></div>
<script>
// Template pura: el HyperFrames se conecta al servicio en 127.0.0.1:4490
globalThis.HYPERFRAMES_NO_TELEMETRY = true;
globalThis.HYPERFRAMES_PORT = 4490;

globalThis.renderizarVideo = function(html, opciones) {
  parent.postMessage({
    protomolecula: 1,
    canal: "__EDITOR_CANAL__",
    tipo: "renderizar",
    html,
    opciones: opciones || {}
  }, "*");
};

globalThis.actualizarVideo = function(propiedad, valor, elementoId) {
  parent.postMessage({
    protomolecula: 1,
    canal: "__EDITOR_CANAL__",
    tipo: "actualizar",
    propiedad,
    valor,
    elementoId
  }, "*");
};

globalThis.eliminarVideo = function(elementoId) {
  parent.postMessage({
    protomolecula: 1,
    canal: "__EDITOR_CANAL__",
    tipo: "eliminar",
    elementoId
  }, "*");
};

// Estructura raíz obligatoria por HyperFrames
const composition = document.createElement('div');
composition.setAttribute('data-composition-id', 'main');
composition.setAttribute('data-start', '0');
composition.setAttribute('data-duration', '30');
composition.setAttribute('data-width', '1280');
composition.setAttribute('data-height', '720');
composition.setAttribute('data-no-timeline', '');
composition.innerHTML = '\n  <style>\n    .clip { pointer-events: auto; }\n  </style>\n  <div id=\"container\" class=\"clip\" data-start=\"0\" data-duration=\"30\" data-track-index=\"0\">\n    <div class=\"layer content\">Cargar vídeo, imagen, audio o texto</div>\n  </div>\n';
document.body.appendChild(composition);
</script>
</body>
</html>`;
}