// Catálogo de rutas del contrato §3: candidatas locales y externas por tarea.
// Lo medido va con `verificado: "2026-10-28"`; lo demás, «por-verificar».

import type { Ruta, TareaViva } from "./tipos";

const CATALOGO: Ruta[] = [
  {
    id: "threejs-escena3d", nombre: "Three.js, átomo escena3d", tipo: "local",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.8 }, unidad: "escena",
    creditosPorUnidad: 0, requiere: "gpu", privacidad: "local", licencia: "MIT",
    comercial: true, latenciaS: 0, verificado: "por-verificar",
    fuente: "contrato §3: pieza propia de la Protomolécula",
  },
  {
    id: "blender-neurona", nombre: "Blender en la neurona A1", tipo: "local",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.9 }, unidad: "escena",
    creditosPorUnidad: 0, requiere: "neurona-capaz", privacidad: "local",
    licencia: "GPL", comercial: true, latenciaS: 900, verificado: "por-verificar",
    fuente: "contrato §3: render dentro de la neurona",
  },
  {
    id: "spline-mcp", nombre: "Spline por MCP, plan Pro", tipo: "externo",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.7 }, unidad: "llamada",
    creditosPorUnidad: 6, requiere: "cuenta", privacidad: "sale-de-la-neurona",
    licencia: "propietaria", comercial: true, latenciaS: 30, verificado: "2026-10-28",
    fuente: "contrato §3, medido: 200 llamadas al día que se reinician a las 00:00 UTC; una escena propia gasta unas 6 a 10 llamadas",
    enlaceConectar: "https://mcp.spline.design/mcp",
  },
  {
    id: "spline-comunidad", nombre: "Escena de la comunidad de Spline embebida", tipo: "externo",
    tareas: ["escena-3d"], calidad: { "escena-3d": 0.6 }, unidad: "escena",
    creditosPorUnidad: 0, requiere: "conector", privacidad: "sale-de-la-neurona",
    licencia: "la suya, con crédito al autor", comercial: false, latenciaS: 0,
    verificado: "por-verificar",
    fuente: "contrato §3: solo embeber o remezclar, nunca editar la escena ajena",
    enlaceConectar: "https://mcp.spline.design/mcp",
  },
  {
    id: "imagen-local-neurona", nombre: "Modelos de imagen locales (ComfyUI, FLUX, Qwen-Image)", tipo: "local",
    tareas: ["fotograma-clave", "foto"],
    calidad: { "fotograma-clave": 0.6, foto: 0.6 }, unidad: "imagen",
    creditosPorUnidad: 0, requiere: "neurona-capaz", privacidad: "local",
    licencia: "la de cada modelo", comercial: true, latenciaS: 60,
    verificado: "por-verificar",
    fuente: "contrato §3, vía areas/generacion-imagenes de la neurona",
  },
  {
    id: "higgsfield-nano-banana-2", nombre: "Higgsfield Nano Banana 2", tipo: "externo",
    tareas: ["fotograma-clave", "foto"],
    calidad: { "fotograma-clave": 0.9, foto: 0.9 }, unidad: "imagen",
    creditosPorUnidad: 2, requiere: "cuenta", privacidad: "sale-de-la-neurona",
    licencia: "propietaria", comercial: true, latenciaS: 20, verificado: "2026-10-28",
    fuente: "contrato §3, medido: 2 créditos por imagen",
    enlaceConectar: "https://higgsfield.ai",
  },
  {
    id: "google-flow", nombre: "Google Flow (Veo, cuenta de Alex)", tipo: "externo",
    tareas: ["fotograma-clave", "foto", "clip-pelicula"],
    calidad: { "fotograma-clave": 0.9, foto: 0.9, "clip-pelicula": 0.9 },
    unidad: "generación", creditosPorUnidad: 0, requiere: "cuenta",
    privacidad: "sale-de-la-neurona", licencia: "propietaria", comercial: true,
    latenciaS: 120, verificado: "por-verificar",
    fuente: "contrato §3: el coste depende del plan de Google, no se cotiza aquí",
    enlaceConectar: "https://labs.google/flow",
  },
  {
    id: "higgsfield-seedance-2", nombre: "Higgsfield Seedance 2.0", tipo: "externo",
    tareas: ["clip-pelicula"], calidad: { "clip-pelicula": 0.9 },
    unidad: "clip de 5 s a 1080p", creditosPorUnidad: 60, requiere: "cuenta",
    privacidad: "sale-de-la-neurona", licencia: "propietaria", comercial: true,
    latenciaS: 300, verificado: "2026-10-28",
    fuente: "contrato §3, medido: 1080p y 5 s unos 60 créditos, 720p unos 30; extremos fijados y sin audio",
    enlaceConectar: "https://higgsfield.ai",
  },
  {
    id: "clip-neurona-gpu", nombre: "Clip local en una neurona con GPU suficiente", tipo: "local",
    tareas: ["clip-pelicula"], calidad: { "clip-pelicula": 0.7 }, unidad: "clip",
    creditosPorUnidad: 0, requiere: "gpu", privacidad: "local",
    licencia: "la de los modelos locales", comercial: true, latenciaS: 600,
    verificado: "por-verificar",
    fuente: "contrato §3: solo si la neurona aguanta la carga, por-verificar",
  },
  {
    id: "ffmpeg-foto-viva", nombre: "Bucle de ida y vuelta con ffmpeg (foto viva)", tipo: "local",
    tareas: ["foto-viva"], calidad: { "foto-viva": 0.8 }, unidad: "bucle",
    creditosPorUnidad: 0, requiere: "neurona-capaz", privacidad: "local",
    licencia: "GPL", comercial: true, latenciaS: 30, verificado: "por-verificar",
    fuente: "contrato §3: un clip con inicio igual al final y sin cortes",
  },
  {
    id: "codigo-grafico-vivo", nombre: "Gráfico vivo en código (HyperFrames y recetas propias)", tipo: "local",
    tareas: ["grafico-vivo"], calidad: { "grafico-vivo": 0.9 }, unidad: "gráfico",
    creditosPorUnidad: 0, requiere: "gpu", privacidad: "local",
    licencia: "propia de StarSeed", comercial: true, latenciaS: 0,
    verificado: "por-verificar", fuente: "contrato §3: siempre local, 0 créditos",
  },
  {
    id: "revision-texto-local", nombre: "Revisión de texto local", tipo: "local",
    tareas: ["revision-texto"], calidad: { "revision-texto": 0.7 }, unidad: "texto",
    creditosPorUnidad: 0, requiere: "neurona-capaz", privacidad: "local",
    licencia: "propia de StarSeed", comercial: true, latenciaS: 10,
    verificado: "por-verificar", fuente: "contrato §3: siempre local",
  },
  {
    id: "comprobacion-local", nombre: "Comprobación local", tipo: "local",
    tareas: ["comprobacion"], calidad: { comprobacion: 0.7 }, unidad: "comprobación",
    creditosPorUnidad: 0, requiere: "neurona-capaz", privacidad: "local",
    licencia: "propia de StarSeed", comercial: true, latenciaS: 5,
    verificado: "por-verificar", fuente: "contrato §3: siempre local",
  },
];

/** Todas las rutas candidatas, locales primero y luego las externas. */
export const CATALOGO_RUTAS: readonly Ruta[] = CATALOGO;

/** Rutas que saben atender una tarea concreta. */
export function rutasParaTarea(tarea: TareaViva): Ruta[] {
  return CATALOGO_RUTAS.filter((r) => r.tareas.includes(tarea));
}
