/**
 * Adaptador puro para el Space público de Pixal3D (Ola 1011D · tarea G3D1011F).
 * Contrato: architecture/astraura-avatares-3d.md §11.2.
 *
 * Reglas duras del contrato:
 *  - «Basta de ilusiones»: si el Space no se puede usar, se dice el motivo; nada de simular un GLB.
 *  - Solo con `permiso: true` explícito (la imagen SALE del aparato de la persona).
 *  - Nunca con una foto de personas sin su consentimiento expreso.
 *  - Tope diario por persona y tamaño máximo de imagen.
 *  - La procedencia es la del motor `pixal3d-espacio` en `motores.ts`.
 *
 * Este módulo NO toca red ni disco: construye peticiones y valida. La red vive
 * en `src/app/api/avatares/espacio-hf/route.ts`.
 *
 * API REAL verificada el 2026-10-13 en https://tencentarc-pixal3d.hf.space/gradio_api/info
 * (Gradio 6): subir con POST /gradio_api/upload; llamar con POST /gradio_api/call/<fn>
 * (devuelve {event_id}); resultado en GET /gradio_api/call/<fn>/<event_id> (SSE,
 * evento `complete` con `data: [...]`). Funciones nombradas: /preprocess (image),
 * /generate_3d (image, seed, resolution, …) y /extract_glb_api (state_path,
 * decimation_target, texture_size, session_id) que devuelve el GLB.
 */
import { MOTORES_3D } from "@/lib/avatares/adn/motores";

export const ESPACIO_HF_URL = "https://tencentarc-pixal3d.hf.space";
export const ESPACIO_HF_ID = "TencentARC/Pixal3D";

/** Tope duro por petición: evita que alguien suba un RAW de 200 MB a un servicio gratuito. */
export const MAX_IMAGEN_BYTES = 8 * 1024 * 1024;

/** Tope diario por persona del respaldo remoto (separado y menor que la cuota ZeroGPU). */
export const TOPE_DIARIO_POR_DEFECTO = 3;

/** Resolución pedida por defecto: la modalidad de poca VRAM publicada por Pixal3D. */
export const RESOLUCION_POR_DEFECTO = 1024;

/** Decimación del GLB extraído (triángulos): techo del nivel «vrm-completo» del avatar. */
export const DECIMACION_POR_DEFECTO = 120000;

export const TEXTURA_POR_DEFECTO = 1024;

export const MIMES_PERMITIDOS = ["image/png", "image/jpeg", "image/webp"] as const;

/** Opciones que la persona (o el taller en su nombre) envía con la petición. */
export interface PeticionEspacioHf {
  /** true explícito: la persona acepta que SU imagen salga a Hugging Face. */
  permiso: boolean;
  /** La imagen contiene personas reales. */
  esFotoDePersonas?: boolean;
  /** Consentimiento de las personas fotografiadas (exigido si hay personas). */
  consentimientoPersonas?: boolean;
  /** Tamaño de la imagen en bytes. */
  imagenBytes: number;
  /** Tipo MIME declarado de la imagen. */
  mime: string;
  /** Cuántas generaciones de este Space lleva hoy la persona. */
  usoHoy: number;
}

export type DecisionEspacio =
  | { ok: true }
  | { ok: false; motivo: string };

/** Motivo humano por el que NO se puede usar el Space, o null si todo está bien. */
export function motivoDenegacion(p: PeticionEspacioHf, tope = TOPE_DIARIO_POR_DEFECTO): string | null {
  if (!p.permiso) {
    return "Falta tu permiso: esta herramienta manda tu imagen al espacio público de Hugging Face y no puede hacerlo sin que lo aceptes.";
  }
  if (p.esFotoDePersonas && !p.consentimientoPersonas) {
    return "La imagen contiene personas y falta su consentimiento: nunca subimos fotos de personas sin que lo hayan aceptado.";
  }
  if (p.imagenBytes <= 0 || p.imagenBytes > MAX_IMAGEN_BYTES) {
    return `La imagen no es válida o pesa más de lo permitido (${Math.floor(MAX_IMAGEN_BYTES / (1024 * 1024))} MB).`;
  }
  if (!(MIMES_PERMITIDOS as readonly string[]).includes(p.mime)) {
    return `Formato no admitido (solo PNG, JPEG o WebP); llegó «${p.mime}».`;
  }
  if (topeAlcanzado(p.usoHoy, tope)) {
    return `Has llegado al tope de hoy (${tope} generaciones): el espacio gratuito reparte su cuota entre toda persona que lo usa.`;
  }
  return null;
}

/** ¿Se gastó el tope diario de esta persona? */
export function topeAlcanzado(usoHoy: number, tope = TOPE_DIARIO_POR_DEFECTO): boolean {
  return usoHoy >= tope;
}

/** Clave de día civil (UTC) para reiniciar el contador sin relojes extraños. */
export function claveDia(fecha = new Date()): string {
  return fecha.toISOString().slice(0, 10);
}

/* ── Construcción y lectura de la API de Gradio (verificada el 2026-10-13) ── */

/** Forma FileData de Gradio 6: así se refieren a un archivo en las llamadas. */
export interface FileDataGradio {
  path: string;
  url?: string | null;
  size?: number | null;
  orig_name?: string | null;
  mime_type?: string | null;
  is_stream?: boolean;
  meta?: { _type: "gradio.FileData" };
}

export interface OpcionesGeneracion {
  seed?: number;
  resolution?: number;
  decimationTarget?: number;
  textureSize?: number;
}

const SEMILLA_POR_DEFECTO = 1234;

/** URL del archivo de subida: el Space a veces manda `url` completa y a veces solo `path`. */
export function urlDeArchivo(f: FileDataGradio, base = ESPACIO_HF_URL): string | null {
  if (f.url) return f.url;
  if (typeof f.path === "string" && f.path.length > 0) {
    return `${base}/gradio_api/file=${f.path}`;
  }
  return null;
}

/** Cuerpo de POST /gradio_api/call/preprocess: recorta y centra el sujeto. */
export function cuerpoPreproceso(imagen: FileDataGradio): { data: unknown[] } {
  return { data: [conMetaArchivo(imagen)] };
}

/**
 * Cuerpo de POST /gradio_api/call/generate_3d. Los parámetros 4–18 llevan los
 * valores por defecto que publica el propio Space (no los inventamos).
 */
export function cuerpoGenerar3d(
  imagen: FileDataGradio,
  opciones: OpcionesGeneracion = {},
  sessionId = "starseed",
): { data: unknown[] } {
  return {
    data: [
      conMetaArchivo(imagen),
      opciones.seed ?? SEMILLA_POR_DEFECTO,
      opciones.resolution ?? RESOLUCION_POR_DEFECTO,
      7.5, 0.7, 12, 5.0, // sparse structure
      7.5, 0.5, 12, 3.0, // shape slat
      1.0, 0.0, 12, 3.0, // texture slat
      0.0, "grados", // manual_fov, unidad
      sessionId,
    ],
  };
}

/** Cuerpo de POST /gradio_api/call/extract_glb_api: malla GLB decimada con textura. */
export function cuerpoExtraerGlb(
  statePath: string,
  opciones: OpcionesGeneracion = {},
  sessionId = "starseed",
): { data: unknown[] } {
  return {
    data: [
      statePath,
      opciones.decimationTarget ?? DECIMACION_POR_DEFECTO,
      opciones.textureSize ?? TEXTURA_POR_DEFECTO,
      sessionId,
    ],
  };
}

function conMetaArchivo(f: FileDataGradio): FileDataGradio {
  return { ...f, is_stream: f.is_stream ?? false, meta: { _type: "gradio.FileData" } };
}

/**
 * Lee la respuesta SSE de GET /gradio_api/call/<fn>/<event_id> y devuelve el
 * `data` del evento `complete`. Devuelve el motivo si el Space reporta `error`.
 */
export function resultadoDeSse(sse: string):
  | { ok: true; datos: unknown[] }
  | { ok: false; motivo: string } {
  let evento = "";
  for (const linea of sse.split("\n")) {
    if (linea.startsWith("event:")) evento = linea.slice("event:".length).trim();
    if (evento === "complete" && linea.startsWith("data:")) {
      try {
        const datos = JSON.parse(linea.slice("data:".length)) as unknown[];
        return Array.isArray(datos) ? { ok: true, datos } : { ok: false, motivo: "El espacio respondió con una forma que no entiendo." };
      } catch {
        return { ok: false, motivo: "La respuesta del espacio vino dañada y no se pudo leer." };
      }
    }
    if (evento === "error" && linea.startsWith("data:")) {
      return { ok: false, motivo: "El espacio de Hugging Face devolvió un error (posiblemente se agotó su cuota gratuita de hoy)." };
    }
  }
  return { ok: false, motivo: "El espacio no terminó su respuesta (sin evento «complete»)." };
}

/** Del resultado de /extract_glb_api, la URL de descarga del GLB. */
export function urlGlbDeResultado(datos: unknown[], base = ESPACIO_HF_URL): string | null {
  const primero = datos[0];
  if (!primero || typeof primero !== "object") return null;
  return urlDeArchivo(primero as FileDataGradio, base);
}

/** Del resultado de /generate_3d (un diccionario), la ruta de estado para extraer el GLB. */
export function statePathDeResultado(datos: unknown[]): string | null {
  const primero = datos[0];
  if (!primero || typeof primero !== "object") return null;
  for (const clave of ["state_path", "path", "state"] as const) {
    const v = (primero as Record<string, unknown>)[clave];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/** Datos del motor de procedencia (pixal3d-espacio en motores.ts; si falta, se dice). */
export function procedenciaMotor():
  | { motorId: string; licencia: string; uso: string; atribucion: string | null; fuente: string }
  | { motorId: null; motivo: string } {
  const motor = MOTORES_3D.find((m) => m.id === "pixal3d-espacio");
  if (!motor) return { motorId: null, motivo: "El motor pixal3d-espacio no está en la tabla del taller." };
  return {
    motorId: motor.id,
    licencia: motor.licencia,
    uso: motor.uso,
    atribucion: motor.atribucion ?? null,
    fuente: motor.fuente,
  };
}
