/**
 * Protomolécula · Átomo «Animación 3D (ManimGX)»: escena de Manim CE → MP4.
 * La ejecución es un PLAN PURO: los parámetros se traducen a una escena que el
 * cliente-render (MGX1023B) manda al Worker de Pyodide. El código que escribe un
 * agente NUNCA corre en el proceso del OS (contractos §3 y §11.1).
 * Contrato: architecture/repos-3d-oido-agentes-1023.md §3; architecture/protomolecula.md §11.1
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import { renderizarEscena } from "@/lib/protomolecula/manimgx/cliente-render";
import type { EscenaManim, ResultadoRender } from "@/lib/protomolecula/manimgx/worker-render";

/** Calidad → resolución del fotograma; color de fondo declarado por opción → CSS que entiende Manim (el fondo por defecto es el del OS). */
const RESOLUCIONES: Record<string, { ancho: number; alto: number }> = { "720p": { ancho: 1280, alto: 720 }, "1080p": { ancho: 1920, alto: 1080 }, "4k": { ancho: 3840, alto: 2160 } };
const COLORES_FONDO: Record<string, string> = { oscuro: "#0b0b14", negro: "#000000", blanco: "#ffffff", gris: "#808080" };

export const ANIMACION_MANIMGX: DefinicionAtomo = {
  herramientaId: "animacion-manimgx",
  nombre: "Animación 3D (ManimGX)",
  categoria: "3d",
  integracion: "wasm-en-worker",
  control: "total",
  parametros: [
    { id: "calidad", nombre: "Calidad", tipo: "opcion", opciones: Object.keys(RESOLUCIONES), defecto: "1080p", sinonimos: ["resolución", "calidad de vídeo"] },
    { id: "fps", nombre: "Fotogramas por segundo", tipo: "entero", min: 1, max: 60, paso: 1, unidad: "fps", defecto: 30, sinonimos: ["frames por segundo", "fotogramas"] },
    { id: "duracion", nombre: "Duración", tipo: "numero", min: 1, max: 60, paso: 0.5, unidad: "s", defecto: 10, sinonimos: ["duración de la animación", "tiempo"] },
    { id: "rotacion-camara", nombre: "Rotación de cámara", tipo: "numero", min: -360, max: 360, paso: 1, unidad: "grados", defecto: 0, sinonimos: ["giro de cámara", "orbe de cámara"] },
    { id: "color-fondo", nombre: "Color de fondo", tipo: "opcion", opciones: Object.keys(COLORES_FONDO), defecto: "oscuro", sinonimos: ["fondo", "color de la escena"] },
    { id: "renderizar", nombre: "Renderizar", tipo: "disparo", defecto: false, sinonimos: ["render", "renderizar escena", "exportar MP4"] },
  ],
  entradas: ["py"],
  salidas: ["mp4"],
  ficha: {
    web: "https://github.com/academa-labs/manimgx",
    repo: "https://github.com/academa-labs/manimgx",
    licencia: "MIT (ruedas nativas con x264: GPL en conjunto)",
  },
};

const param = (id: string) => ANIMACION_MANIMGX.parametros.find((p) => p.id === id);

/** Lo que se manda al Worker: la escena de Manim y su cámara. */
export interface EnvioRender {
  escena: EscenaManim;
  ancho: number;
  alto: number;
  fps: number;
  rotacionCamara: number;
  colorFondo: string;
}

export type RespuestaEnvio =
  | { ok: true; envio: EnvioRender }
  | { ok: false; motivo: string };

/** Una opción declarada (o su defecto); si el valor no está entre las opciones, defiende el defecto. */
const opcionDe = (valores: Record<string, ValorParametro | undefined>, id: string): string => {
  const p = param(id), v = valores[id];
  const valido = typeof v === "string" && (p?.opciones ?? []).includes(v);
  return valido ? (v as string) : String(p?.defecto ?? "");
};

/** Un número acotado al rango declarado; lo que no sea un número finito no mueve nada. */
const numeroDe = (valores: Record<string, ValorParametro | undefined>, id: string): number => {
  const p = param(id), v = valores[id];
  if (typeof v !== "number" || !Number.isFinite(v)) return Number(p?.defecto ?? 0);
  if (p?.min !== undefined && p?.max !== undefined) return Math.max(p.min, Math.min(p.max, v));
  return v;
};

/** Sin código de escena no hay nada que renderizar: evita mandar un MP4 vacío. */
export function escenaValida(codigoPython: string): { ok: true } | { ok: false; motivo: string } {
  if (typeof codigoPython !== "string" || codigoPython.trim() === "") {
    return { ok: false, motivo: "falta el código Python de la escena" };
  }
  return { ok: true };
}

/** Los parámetros de la mano (dictado, panel, vínculos) → envío al Worker. PURO. */
export function enviarDesde(
  valores: Record<string, ValorParametro | undefined>,
  codigoPython: string,
  nombre = "escena-animacion",
): RespuestaEnvio {
  const valida = escenaValida(codigoPython);
  if (!valida.ok) return valida;
  const resolucion = RESOLUCIONES[opcionDe(valores, "calidad")] ?? RESOLUCIONES["1080p"];
  const envio: EnvioRender = {
    escena: { nombre, codigoPython, duracionMaxSegundos: numeroDe(valores, "duracion") },
    ancho: resolucion.ancho,
    alto: resolucion.alto,
    fps: Math.round(numeroDe(valores, "fps")),
    rotacionCamara: numeroDe(valores, "rotacion-camara"),
    colorFondo: COLORES_FONDO[opcionDe(valores, "color-fondo")] ?? COLORES_FONDO.oscuro,
  };
  return { ok: true, envio };
}

/** Lo que sale del átomo: el MP4 (siempre) y, cuando algo falla, el motivo honesto. */
export interface SalidaAnimacion extends ResultadoRender {
  mp4: Uint8Array | null;
}

/**
 * Acción «renderizar»: manda la escena al cliente-render (MGX1023B), que habla con el
 * Worker de Pyodide + WebGPU. Aquí no se interpreta ningún código de Manim: el OS solo
 * encola (contractos §3); el MP4 llega como bytes del Worker y queda guardado por quien
 * lo publica o archiva.
 */
export async function renderizarAnimacion(
  respuesta: RespuestaEnvio,
  senal?: AbortSignal,
): Promise<SalidaAnimacion> {
  if (!respuesta.ok) {
    return { escena: "", bytes: null, cancelado: false, error: respuesta.motivo, mp4: null };
  }
  const res = await renderizarEscena(respuesta.envio.escena, undefined, senal);
  return { ...res, mp4: res.bytes };
}
