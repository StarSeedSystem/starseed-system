import type { Ruta, TareaViva } from "./tipos";

/** Todas las tareas del contrato, en el orden en que se muestran. */
export const TAREAS_VIVAS: readonly TareaViva[] = ["escena-3d", "fotograma-clave", "foto", "clip-pelicula", "foto-viva", "grafico-vivo", "revision-texto", "comprobacion"];

/** Catálogo de candidatos: locales primero y después los servicios externos. */
export const CATALOGO_RUTAS: readonly Ruta[] = [
  {
    id: "threejs-escena3d", nombre: "Three.js (átomo escena3d)", tipo: "local",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.75 },
    creditosPorUnidad: 0, unidad: "escena", requiere: [],
    privacidad: "local", licencia: "MIT", comercial: true, latenciaS: 1,
    verificado: "por-verificar", fuente: "https://threejs.org",
  },
  {
    id: "blender-neurona-capaz", nombre: "Blender en una neurona capaz (A1)", tipo: "local",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.9 },
    creditosPorUnidad: 0, unidad: "escena", requiere: ["neurona-capaz"],
    privacidad: "local", licencia: "GPL-2.0-or-later", comercial: true, latenciaS: 120,
    verificado: "por-verificar", fuente: "https://www.blender.org",
  },
  {
    id: "imagen-local-neurona", nombre: "Modelos de imagen locales (ComfyUI, FLUX, Qwen-Image)", tipo: "local",
    tareas: ["fotograma-clave", "foto"], calidad: { "fotograma-clave": 0.7, foto: 0.7 },
    creditosPorUnidad: 0, unidad: "imagen", requiere: ["neurona-capaz", "gpu"],
    privacidad: "local", licencia: "según el modelo", comercial: false, latenciaS: 45,
    verificado: "por-verificar", fuente: "areas/generacion-imagenes",
  },
  {
    id: "clip-neurona-gpu", nombre: "Clip en una neurona con GPU suficiente", tipo: "local",
    tareas: ["clip-pelicula"], calidad: { "clip-pelicula": 0.8 },
    creditosPorUnidad: 0, unidad: "clip de 5 s", requiere: ["neurona-capaz", "gpu"],
    privacidad: "local", licencia: "según el modelo", comercial: false, latenciaS: 300,
    verificado: "por-verificar", fuente: "architecture/contenido-vivo.md",
  },
  {
    id: "ffmpeg-foto-viva", nombre: "ffmpeg (bucle de ida y vuelta)", tipo: "local",
    tareas: ["foto-viva"], calidad: { "foto-viva": 0.8 },
    creditosPorUnidad: 0, unidad: "bucle", requiere: [],
    privacidad: "local", licencia: "LGPL-2.1-or-later", comercial: true, latenciaS: 10,
    verificado: "por-verificar", fuente: "https://ffmpeg.org",
  },
  {
    id: "hyperframes-grafico-vivo", nombre: "Código y HyperFrames (recetas propias)", tipo: "local",
    tareas: ["grafico-vivo"], calidad: { "grafico-vivo": 0.9 },
    creditosPorUnidad: 0, unidad: "gráfico", requiere: [],
    privacidad: "local", licencia: "propia de StarSeed", comercial: true, latenciaS: 1,
    verificado: "por-verificar", fuente: "architecture/video-hyperframes.md",
  },
  {
    id: "revision-local", nombre: "Revisión de texto local", tipo: "local",
    tareas: ["revision-texto"], calidad: { "revision-texto": 0.8 },
    creditosPorUnidad: 0, unidad: "texto", requiere: [],
    privacidad: "local", licencia: "propia de StarSeed", comercial: true, latenciaS: 2,
    verificado: "por-verificar", fuente: "scripts/contenido_vivo/comprobar.py",
  },
  {
    id: "comprobacion-local", nombre: "Comprobador propio de contenido vivo", tipo: "local",
    tareas: ["comprobacion"], calidad: { comprobacion: 0.9 },
    creditosPorUnidad: 0, unidad: "comprobación", requiere: [],
    privacidad: "local", licencia: "propia de StarSeed", comercial: true, latenciaS: 3,
    verificado: "por-verificar", fuente: "scripts/contenido_vivo/comprobar.py",
  },
  {
    id: "spline-mcp", nombre: "Spline por MCP", tipo: "externo",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.85 },
    creditosPorUnidad: 8, unidad: "escena (≈6-10 llamadas; plan Pro: 200 al día, reinicio 00:00 UTC)",
    requiere: ["conector", "cuenta"], privacidad: "sale-de-la-neurona",
    licencia: "Spline (plan Pro)", comercial: true, latenciaS: 60,
    verificado: "2026-10-28", fuente: "https://mcp.spline.design/mcp", enlaceConectar: "https://mcp.spline.design/mcp",
  },
  {
    id: "spline-comunidad", nombre: "Escena de la comunidad de Spline embebida", tipo: "externo",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.8 },
    creditosPorUnidad: 0, unidad: "escena embebida (crédito al autor)",
    requiere: ["conector"], privacidad: "sale-de-la-neurona",
    licencia: "según el autor", comercial: false, latenciaS: 5,
    verificado: "por-verificar", fuente: "https://spline.design/community", enlaceConectar: "https://spline.design/community",
  },
  {
    id: "higgsfield-nano-banana-2", nombre: "Higgsfield Nano Banana 2", tipo: "externo",
    tareas: ["fotograma-clave", "foto"], calidad: { "fotograma-clave": 0.9, foto: 0.9 },
    creditosPorUnidad: 2, unidad: "imagen", requiere: ["conector", "cuenta"],
    privacidad: "sale-de-la-neurona", licencia: "Higgsfield", comercial: true, latenciaS: 30,
    verificado: "2026-10-28", fuente: "https://higgsfield.ai", enlaceConectar: "https://higgsfield.ai",
  },
  {
    id: "google-flow-imagen", nombre: "Google Flow (imagen)", tipo: "externo",
    tareas: ["fotograma-clave", "foto"], calidad: { "fotograma-clave": 0.85, foto: 0.85 },
    creditosPorUnidad: 0, unidad: "imagen (cuenta de Alex, coste por verificar)",
    requiere: ["conector", "cuenta"], privacidad: "sale-de-la-neurona",
    licencia: "Google", comercial: true, latenciaS: 30,
    verificado: "por-verificar", fuente: "https://labs.google/flow", enlaceConectar: "https://labs.google/flow",
  },
  {
    id: "higgsfield-seedance-2-720", nombre: "Higgsfield Seedance 2.0 (720p)", tipo: "externo",
    tareas: ["clip-pelicula"], calidad: { "clip-pelicula": 0.9 },
    creditosPorUnidad: 30, unidad: "clip de 5 s a 720p, sin audio",
    requiere: ["conector", "cuenta"], privacidad: "sale-de-la-neurona",
    licencia: "Higgsfield", comercial: true, latenciaS: 120,
    verificado: "2026-10-28", fuente: "https://higgsfield.ai", enlaceConectar: "https://higgsfield.ai",
  },
  {
    id: "higgsfield-seedance-2-1080", nombre: "Higgsfield Seedance 2.0 (1080p)", tipo: "externo",
    tareas: ["clip-pelicula"], calidad: { "clip-pelicula": 0.95 },
    creditosPorUnidad: 60, unidad: "clip de 5 s a 1080p, sin audio",
    requiere: ["conector", "cuenta"], privacidad: "sale-de-la-neurona",
    licencia: "Higgsfield", comercial: true, latenciaS: 180,
    verificado: "2026-10-28", fuente: "https://higgsfield.ai", enlaceConectar: "https://higgsfield.ai",
  },
  {
    id: "google-flow-video", nombre: "Google Flow (Veo)", tipo: "externo",
    tareas: ["clip-pelicula"], calidad: { "clip-pelicula": 0.85 },
    creditosPorUnidad: 0, unidad: "clip (cuenta de Alex, coste por verificar)",
    requiere: ["conector", "cuenta"], privacidad: "sale-de-la-neurona",
    licencia: "Google", comercial: true, latenciaS: 180,
    verificado: "por-verificar", fuente: "https://labs.google/flow", enlaceConectar: "https://labs.google/flow",
  },
];
