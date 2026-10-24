/**
 * Adaptador de la capa «espacio» del plan de imágenes (ESP1011D). Contratos:
 * architecture/astraura-imagenes.md §3–§4 y §11.2 de astraura-avatares-3d.md.
 *
 * Dos Spaces públicos verificados EN MARCHA el 2026-10-24 (via huggingface.co/api/spaces,
 * ambos RUNNING en ZeroGPU A10G con Gradio 5, licencia Apache-2.0 y /infer aceptando
 * semilla con randomize_seed=false): FLUX.1 [schnell] y Qwen-Image. El de Qwen-Image 2.1
 * corre en CPU básica y NO se usa. Las llamadas salen SIEMPRE del navegador de cada
 * persona, nunca de nuestro servidor: cada quien gasta su propia cuota de ZeroGPU
 * (2 min/día sin cuenta, 5 con cuenta gratis, 40 con PRO). El token de Hugging Face,
 * si la persona lo pone, vive solo en su aparato (src/lib/safe-storage.ts) y nunca
 * viaja a StarSeed. Son texto → imagen: con una imagen de referencia, planImagen exige
 * permiso y el Space no la tocaría (no sabe usarla).
 * PURO salvo `ejecutarEspacioImagen` (fetch inyectable para probar sin red);
 * reutiliza el cliente Gradio verificado de ESP1011A (espacio-hf.ts).
 */
import { resultadoDeSse, urlDeArchivo, type FileDataGradio } from "@/lib/avatares/adaptadores/espacio-hf";
import { MODELOS_IMAGEN, modeloPorId, type ModeloImagen } from "../modelos";
import type { OpcionImagen } from "../plan";

/** Tope del rango de semilla que publican las dos APIs (numeric value between 0 and 2147483647). */
export const SEMILLA_MAXIMA = 2147483647;

/** Tiempo máximo por generación: Qwen-Image pide 50 pasos y tarda mucho más que FLUX (4). */
export const TIMEOUT_ESPACIO_MS = 180000;

export interface EspacioImagen {
  /** Id del modelo del catálogo (MODELOS_IMAGEN). */
  modeloId: string;
  /** Id del Space en Hugging Face. */
  espacioId: string;
  /** Subdominio del Space (https://<propietario>-<slug>.hf.space). */
  url: string;
  /** Función nombrada de la API pública de Gradio (verificada en /gradio_api/info). */
  endpoint: string;
  /** Pasos por defecto que publica el propio Space. */
  pasos: number;
  /** Proporción: FLUX va por lado (cuadrado) y Qwen-Image por proporción rectangular. */
  forma: "lado" | "aspecto";
}

export const ESPACIOS_IMAGEN: readonly EspacioImagen[] = [
  {
    modeloId: "flux1-schnell",
    espacioId: "black-forest-labs/FLUX.1-schnell",
    url: "https://black-forest-labs-flux-1-schnell.hf.space",
    endpoint: "/infer",
    pasos: 4,
    forma: "lado",
  },
  {
    modeloId: "qwen-image",
    espacioId: "Qwen/Qwen-Image",
    url: "https://qwen-qwen-image.hf.space",
    endpoint: "/infer",
    pasos: 50,
    forma: "aspecto",
  },
];

export interface OpcionesEspacioImagen { lado?: number; aspecto?: string; pasos?: number }
export interface ResultadoEspacioImagen { url?: string; ref?: string; segundos: number; semillaUsada?: number | null }
export type Fetcher = typeof fetch;

/* ── Mapeo modelo ⇄ Space del catálogo ── */

/** El Space de este modelo según la tabla; null si no está en ella (p. ej. Qwen-Image 2.1). */
export function espacioDeModelo(modeloId: string | null | undefined): EspacioImagen | null {
  if (!modeloId) return null;
  return ESPACIOS_IMAGEN.find((e) => e.modeloId === modeloId) ?? null;
}

/** De una opción del plan: solo capa «espacio» con motor espacio-hf y modelo en la tabla. */
export function espacioDeOpcion(op: OpcionImagen): EspacioImagen | null {
  if (op.capa !== "espacio" || op.motor !== "espacio-hf") return null;
  return espacioDeModelo(op.modelo?.id);
}

/** Modelos del catálogo con Space público que este adaptador sabe llamar (ids para `PeticionImagen.espacios`). */
export function espaciosDisponibles(): string[] {
  return MODELOS_IMAGEN.filter((m) => m.espacio && espacioDeModelo(m.id)?.espacioId === m.espacio).map((m) => m.id);
}

/** Atribución visible de cada opción: modelo, licencia y que se hizo en un Space público. */
export function atribucionEspacio(m: ModeloImagen): string {
  return `Imagen generada con ${m.nombre} (licencia ${m.licencia}), hecha en un Space público de Hugging Face con la cuota del propio Space.`;
}

/** La semilla de la opción cabe en el rango del Space (0…2147483647), sea la que sea. */
export function semillaEspacio(semilla: number): number {
  const n = Number.isFinite(semilla) ? Math.floor(Math.abs(semilla)) : 0;
  return n % (SEMILLA_MAXIMA + 1);
}

/* ── Cuerpo de POST /gradio_api/call/infer (parámetros publicados por cada Space) ── */

/**
 * FLUX.1-schnell: [prompt, seed, randomize_seed, width, height, num_inference_steps];
 * defectos del Space: lado 1024 (admite 256…2048), 4 pasos. Qwen-Image:
 * [prompt, seed, randomize_seed, aspect_ratio, guidance_scale, num_inference_steps,
 * prompt_enhance]; defectos: “1:1” para que las opciones sean comparables, guía 4.0,
 * 50 pasos, mejora del prompt activada. `randomize_seed=false`: cada opción usa SU semilla.
 */
export function cuerpoInfer(e: EspacioImagen, prompt: string, semilla: number, opciones: OpcionesEspacioImagen = {}): { data: unknown[] } {
  const s = semillaEspacio(semilla);
  if (e.forma === "lado") {
    const lado = Math.max(256, Math.min(2048, opciones.lado ?? 1024));
    return { data: [prompt, s, false, lado, lado, opciones.pasos ?? e.pasos] };
  }
  return { data: [prompt, s, false, opciones.aspecto ?? "1:1", 4, opciones.pasos ?? e.pasos, true] };
}

/* ── Lectura del resultado (misma forma FileData que el cliente de ESP1011A) ── */

/** Del resultado de /infer ([ImageData, seed], §API real), la URL de la imagen generada. */
export function urlImagenDeResultado(datos: unknown[], base: string): string | null {
  const primero = datos[0];
  if (!primero || typeof primero !== "object") return null;
  const f = primero as FileDataGradio;
  if (typeof f.url === "string" && f.url.trim()) {
    const u = f.url.trim();
    if (/^(https?:\/\/|data:)/i.test(u)) return u;
    return `${base}${u.startsWith("/") ? "" : "/"}${u}`;
  }
  return urlDeArchivo(f, base);
}

/** El Space devuelve de vuelta la semilla usada (result[1]): se anota en la opción. */
export function semillaDeResultado(datos: unknown[]): number | null {
  const s = datos[1];
  return typeof s === "number" && Number.isFinite(s) ? Math.floor(s) : null;
}

/* ── Ejecución desde el navegador de cada persona (fetch inyectable en pruebas) ── */

/**
 * Llama al Space de la opción con SU semilla: POST /gradio_api/call/infer ({event_id}) y
 * GET /gradio_api/call/infer/<event_id> (SSE con `complete`). Devuelve null con honestidad
 * si el Space está dormido, lleno (se agotó la cuota ZeroGPU del día), cambió su API o no
 * terminó: el proveedor «neuronas» sustituye la opción por la siguiente del plan.
 */
export async function ejecutarEspacioImagen(
  op: OpcionImagen,
  prompt: string,
  opciones: OpcionesEspacioImagen = {},
  f: Fetcher = fetch,
): Promise<ResultadoEspacioImagen | null> {
  const e = espacioDeOpcion(op);
  const texto = typeof prompt === "string" ? prompt.trim() : "";
  if (!e || !texto) return null;
  const t0 = Date.now();
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => { try { ctl.abort(); } catch { /* el timeout manda */ } }, TIMEOUT_ESPACIO_MS) : null;
  try {
    const llamada = await f(`${e.url}/gradio_api/call${e.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpoInfer(e, texto, semillaEspacio(op.semilla), opciones)),
      signal: ctl?.signal,
      credentials: "omit",
    });
    if (!llamada.ok) return null;
    const datosLlamada = (await llamada.json()) as { event_id?: unknown };
    if (typeof datosLlamada.event_id !== "string" || !datosLlamada.event_id) return null;
    const respuesta = await f(`${e.url}/gradio_api/call${e.endpoint}/${datosLlamada.event_id}`, { signal: ctl?.signal, credentials: "omit" });
    if (!respuesta.ok) return null;
    const resultado = resultadoDeSse(await respuesta.text());
    if (!resultado.ok) return null;
    const url = urlImagenDeResultado(resultado.datos, e.url);
    if (!url) return null;
    return { url, segundos: Math.round(((Date.now() - t0) / 1000) * 10) / 10, semillaUsada: semillaDeResultado(resultado.datos) };
  } catch {
    return null; // Red caída, timeout o respuesta rara: el proveedor prueba la siguiente opción.
  } finally {
    if (timer) clearTimeout(timer);
  }
}
