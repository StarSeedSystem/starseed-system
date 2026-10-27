/**
 * Protomolécula · Átomo «Animación 3D (ManimGX)» (ola 1023X). Motor ManimGX (academa-labs/manimgx,
 * MIT; ruedas nativas con x264: GPL en conjunto) a MP4 para publicaciones y archivos. Contrato:
 * architecture/repos-3d-oido-agentes-1023.md §3: el código de la escena NUNCA corre en el proceso
 * del OS, solo en un Worker (Pyodide + WebGPU) o en contenedor aislado de neurona.
 */
import type { DefinicionAtomo, Parametro } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import { comprobarWebGpu, renderizarEscena } from "@/lib/protomolecula/manimgx/cliente-render";
import type { EscenaManim, ResultadoRender } from "@/lib/protomolecula/manimgx/worker-render";

/** Fondos con la paleta de la casa (armonía): noche Trinity, ámbar Logic, esmeralda Horizon y nebulosa. */
export const COLORES_FONDO: Record<string, string> = {
  noche: "#0b0b14",
  nebulosa: "#2a1e5c",
  ambar: "#d4af37",
  esmeralda: "#10b981",
};

const param = (id: string): Parametro | undefined => ANIMACION_MANIMGX.parametros.find((p) => p.id === id);

export interface EntradaAnimacion {
  /** Nombre de la escena para el MP4 resultante. */
  nombre: string;
  /** Código Manim CE que el agente o el usuario escribe; NUNCA se ejecuta en este proceso. */
  codigoPython: string;
  /** Valores de los parámetros del átomo; falta lo que toque al defecto. */
  valores?: Record<string, ValorParametro | undefined>;
}

export const ANIMACION_MANIMGX: DefinicionAtomo = {
  herramientaId: "animacion-manimgx",
  nombre: "Animación 3D (ManimGX)",
  categoria: "3d",
  integracion: "wasm-en-worker",
  control: "total",
  parametros: [
    { id: "calidad", nombre: "Calidad", tipo: "opcion", opciones: ["borrador", "media", "alta"], defecto: "media", sinonimos: ["contexto de calidad", "resolución"] },
    { id: "fps", nombre: "FPS", tipo: "entero", min: 1, max: 60, paso: 1, unidad: "fps", defecto: 30, sinonimos: ["fotogramas", "fotogramas por segundo"] },
    { id: "duracion", nombre: "Duración", tipo: "numero", min: 0.5, max: 60, paso: 0.5, unidad: "s", defecto: 5, sinonimos: ["duración máx", "tiempo"] },
    { id: "rotacion-camara", nombre: "Rotación de cámara", tipo: "numero", min: 0, max: 360, paso: 1, unidad: "grados", defecto: 0, sinonimos: ["giro de cámara", "cámara"] },
    { id: "color-fondo", nombre: "Color de fondo", tipo: "opcion", opciones: Object.keys(COLORES_FONDO), defecto: "noche", sinonimos: ["fondo"] },
  ],
  entradas: [],
  salidas: ["mp4"],
  ficha: {
    web: "https://pypi.org/project/manimgx/",
    repo: "https://github.com/academa-labs/manimgx",
    licencia: "MIT (ruedas nativas con x264: GPL en conjunto)",
  },
};

/** Un valor numérico acotado al rango del átomo, con el defecto si no es un número. */
function clamp(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}

/** El valor del parámetro como número (opción no cuenta), con el defecto del átomo si falta. */
function numeroDe(valores: Record<string, ValorParametro | undefined> | undefined, id: string, defecto: number): number {
  const v = valores?.[id];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return param(id)?.defecto as number ?? defecto;
}

/** El valor del parámetro como opción válida; si no está en la lista, el defecto. */
function opcionDe(valores: Record<string, ValorParametro | undefined> | undefined, id: string): string {
  const p = param(id);
  if (p?.opciones?.includes(String(valores?.[id]))) return String(valores?.[id]);
  return String(p?.defecto ?? "");
}

/** Resultado del plan: la escena lista para el Worker, los parámetros ya acotados y lo que decide el dispositivo. */
export interface PlanAnimacion {
  escena: EscenaManim;
  /** Rango de calidad y FPS que pide el átomo (los coordina el Worker de ManimGX). */
  calidad: string;
  fps: number;
  duracionMaxSegundos: number;
  rotacionCamaraGrados: number;
  colorFondo: string;
  colorFondoHex: string;
  /** ¿Este dispositivo puede renderizar? (sin WebGPU, no: honesto, no lo intenta) */
  puedeRenderizar: boolean;
  avisos: string[];
}

/** El plan PURO: misma entrada, mismo plan; no corre código ni abre el Worker. */
export function planAnimacion(entrada: EntradaAnimacion): PlanAnimacion {
  const avisos: string[] = [];
  const calidad = opcionDe(entrada.valores, "calidad");
  const fps = clamp(numeroDe(entrada.valores, "fps", 30), 1, 60);
  const duracionMaxSegundos = clamp(numeroDe(entrada.valores, "duracion", 5), 0.5, 60);
  const rotacionCamaraGrados = clamp(numeroDe(entrada.valores, "rotacion-camara", 0), 0, 360);
  const colorFondo = opcionDe(entrada.valores, "color-fondo");
  if (!entrada.codigoPython.trim()) avisos.push("La escena viene sin código: el MP4 no contiene nada útil.");
  if (!comprobarWebGpu()) avisos.push("Este dispositivo no tiene WebGPU: la animación no renderiza aquí.");
  return {
    escena: {
      nombre: entrada.nombre,
      codigoPython: entrada.codigoPython,
      duracionMaxSegundos,
    },
    calidad,
    fps,
    duracionMaxSegundos,
    rotacionCamaraGrados,
    colorFondo,
    colorFondoHex: COLORES_FONDO[colorFondo] ?? COLORES_FONDO.noche,
    puedeRenderizar: comprobarWebGpu(),
    avisos,
  };
}

/** La acción «renderizar»: usa el cliente-render (MGX1023B) y deja el MP4 en la salida del átomo. */
export async function renderizarAnimacion(entrada: EntradaAnimacion): Promise<PlanAnimacion & { resultado: ResultadoRender }> {
  const plan = planAnimacion(entrada);
  const resultado = await renderizarEscena(plan.escena);
  return { ...plan, resultado };
}

