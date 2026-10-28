/**
 * Catálogo de rutas del contenido vivo (CVV1028, `architecture/contenido-vivo.md` §3).
 * Puro: sin red, React ni Node. `verificado` solo lleva fecha donde el contrato lo mide.
 */
import type { Ruta, TareaViva } from "./tipos";

export const TAREAS_VIVAS: readonly TareaViva[] = [
  "escena-3d", "fotograma-clave", "foto", "clip-pelicula",
  "foto-viva", "grafico-vivo", "revision-texto", "comprobacion",
];

const FUENTE = "architecture/contenido-vivo.md §3";
const MEDIDO = "2026-10-28" as const;

export const RUTAS: readonly Ruta[] = [
  {
    id: "threejs-escena3d", nombre: "Three.js (átomo escena3d)", tipo: "local",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.72 }, creditosPorUnidad: 0, unidad: "escena",
    requiere: [], privacidad: "local", licencia: "MIT", comercial: true, latenciaS: 0.4,
    verificado: "por-verificar", fuente: FUENTE,
  },
  {
    id: "blender-neurona", nombre: "Blender en una neurona capaz", tipo: "local",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.85 }, creditosPorUnidad: 0, unidad: "escena",
    requiere: ["neurona-capaz", "gpu"], privacidad: "local", licencia: "GPL-3.0", comercial: true,
    latenciaS: 90, verificado: "por-verificar", fuente: FUENTE,
  },
  {
    id: "imagenes-locales", nombre: "Modelos de imagen locales (ComfyUI, FLUX, Qwen-Image)", tipo: "local",
    tareas: ["fotograma-clave", "foto"], calidad: { "fotograma-clave": 0.78, foto: 0.78 },
    creditosPorUnidad: 0, unidad: "imagen", requiere: ["neurona-capaz", "gpu"], privacidad: "local",
    licencia: "según licencia del modelo", comercial: false, latenciaS: 20,
    verificado: "por-verificar", fuente: FUENTE,
  },
  {
    id: "clip-neurona-gpu", nombre: "Clip en una neurona con GPU suficiente", tipo: "local",
    tareas: ["clip-pelicula"], calidad: { "clip-pelicula": 0.8 }, creditosPorUnidad: 0, unidad: "clip",
    requiere: ["neurona-capaz", "gpu"], privacidad: "local", licencia: "según modelo local",
    comercial: false, latenciaS: 120, verificado: "por-verificar", fuente: FUENTE,
  },
  {
    id: "spline-mcp", nombre: "Spline por MCP", tipo: "externo",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.9 }, creditosPorUnidad: 6, unidad: "escena",
    requiere: ["conector", "cuenta"], privacidad: "sale-de-la-neurona", licencia: "propietaria",
    comercial: true, latenciaS: 60, verificado: MEDIDO, fuente: FUENTE,
    enlaceConectar: "https://mcp.spline.design/mcp", cupo: { porDia: 200, reinicio: "00:00 UTC" }, nota: "Plan Pro; una escena propia gasta entre 6 y 10 llamadas.",
  },
  {
    id: "spline-comunidad", nombre: "Escena de la comunidad de Spline embebida", tipo: "externo",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.65 }, creditosPorUnidad: 0, unidad: "escena",
    requiere: ["conector"], privacidad: "sale-de-la-neurona", licencia: "autor de la escena",
    comercial: false, latenciaS: 30, verificado: "por-verificar", fuente: FUENTE,
    enlaceConectar: "https://app.spline.design/community", nota: "Solo embeber o remezclar; crédito al autor visible.",
  },
  {
    id: "higgsfield-nano-banana-2", nombre: "Higgsfield Nano Banana 2", tipo: "externo",
    tareas: ["fotograma-clave", "foto"], calidad: { "fotograma-clave": 0.9, foto: 0.9 },
    creditosPorUnidad: 2, unidad: "imagen", requiere: ["conector", "cuenta"],
    privacidad: "sale-de-la-neurona", licencia: "propietaria", comercial: true, latenciaS: 25,
    verificado: MEDIDO, fuente: FUENTE, enlaceConectar: "https://higgsfield.ai",
  },
  {
    id: "higgsfield-seedance-2", nombre: "Higgsfield Seedance 2.0", tipo: "externo",
    tareas: ["clip-pelicula"], calidad: { "clip-pelicula": 0.92 }, creditosPorUnidad: 60,
    unidad: "clip 1080p de 5 s", requiere: ["conector", "cuenta"], privacidad: "sale-de-la-neurona",
    licencia: "propietaria", comercial: true, latenciaS: 180, verificado: MEDIDO, fuente: FUENTE,
    enlaceConectar: "https://higgsfield.ai", nota: "Sin audio y con los dos extremos fijados; 720p ≈ 30 créditos.",
  },
  {
    id: "google-flow", nombre: "Google Flow (Veo)", tipo: "externo",
    tareas: ["fotograma-clave", "foto", "clip-pelicula"],
    calidad: { "fotograma-clave": 0.88, foto: 0.85, "clip-pelicula": 0.9 }, creditosPorUnidad: 0,
    unidad: "uso de la cuenta", requiere: ["conector", "cuenta"], privacidad: "sale-de-la-neurona",
    licencia: "propietaria", comercial: true, latenciaS: 120, verificado: "por-verificar",
    fuente: FUENTE, enlaceConectar: "https://labs.google/fx/tools/flow", nota: "Cuenta de Alex; los créditos por uso no están medidos.",
  },
  {
    id: "ffmpeg-foto-viva", nombre: "Bucle con ffmpeg", tipo: "local",
    tareas: ["foto-viva"], calidad: { "foto-viva": 0.8 }, creditosPorUnidad: 0, unidad: "bucle",
    requiere: [], privacidad: "local", licencia: "LGPL-2.1 o GPL según compilación",
    comercial: true, latenciaS: 8, verificado: "por-verificar", fuente: FUENTE, nota: "Ida y vuelta sobre un clip con el inicio igual al final.",
  },
  {
    id: "hiperframes-grafico", nombre: "Código, HyperFrames y recetas propias", tipo: "local",
    tareas: ["grafico-vivo"], calidad: { "grafico-vivo": 0.9 }, creditosPorUnidad: 0,
    unidad: "gráfico", requiere: [], privacidad: "local", licencia: "propia de StarSeed",
    comercial: true, latenciaS: 1, verificado: MEDIDO, fuente: FUENTE, nota: "Siempre local y con 0 créditos.",
  },
  {
    id: "revision-local", nombre: "Revisión de texto local", tipo: "local",
    tareas: ["revision-texto"], calidad: { "revision-texto": 0.82 }, creditosPorUnidad: 0,
    unidad: "revisión", requiere: [], privacidad: "local", licencia: "propia de StarSeed",
    comercial: true, latenciaS: 2, verificado: "por-verificar", fuente: FUENTE,
  },
  {
    id: "comprobacion-local", nombre: "Comprobación local", tipo: "local",
    tareas: ["comprobacion"], calidad: { comprobacion: 0.9 }, creditosPorUnidad: 0,
    unidad: "comprobación", requiere: [], privacidad: "local", licencia: "propia de StarSeed",
    comercial: true, latenciaS: 1, verificado: "por-verificar", fuente: FUENTE,
  },
];

/** Rutas que cubren una tarea, en el orden del catálogo. */
export function rutasDeTarea(tarea: TareaViva): Ruta[] {
  return RUTAS.filter((ruta) => ruta.tareas.includes(tarea));
}

/** Rutas locales que cubren una tarea. */
export function rutasLocalesDe(tarea: TareaViva): Ruta[] {
  return rutasDeTarea(tarea).filter((ruta) => ruta.tipo === "local");
}
/** Busca una ruta por su id. */
export function rutaPorId(id: string): Ruta | undefined {
  return RUTAS.find((ruta) => ruta.id === id);
}
/** Una ruta externa solo sirve si ofrece el enlace para conectarla a la cuenta. */
export function esConectable(ruta: Ruta): boolean {
  return ruta.tipo === "local" || Boolean(ruta.enlaceConectar?.trim());
}
