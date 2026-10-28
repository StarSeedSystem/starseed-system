/**
 * Protomolécula · GENERACIÓN A CAPAS (Ola 1010P · cola F7 · esbozo PM1010F7B). Contrato:
 * `architecture/protomolecula.md` §10·F7 y `architecture/generacion-audiovisual-astraura.md`.
 *
 * `pedirImagen(prompt, deps)` pide una imagen al router gratis-primero del OS (media-gen,
 * INYECTADO: módulo PURO, sin red ni `node:*`) y la entrega como CAPA CANDIDATA `lienzo2d`
 * con `referencia` a la entidad generada: la persona la ACEPTA o la DESCARTA, nunca se
 * inserta sola. Sin cupo o sin medio → «no disponible: <motivo>» tal como lo da el router,
 * sin falsear. Audio y 3D generativos NO entran aquí (en la Biblioteca, «próximamente»).
 */
import type { Capa } from "./tipos";

// provisional: forma mínima del resultado del router de imágenes del OS (media-gen.ts#MediaGenResult)
export interface ResultadoRouter {
  ok: boolean;
  url?: string;
  provider?: string;
  error?: string;
}

// provisional: guardia del tope de peticiones generativas (misma idea que peticion/tope.ts)
export interface CupoResult {
  ok: boolean;
  motivo?: string;
  reintentoEnMin?: number;
}

export const MAX_PROMPT_IMAGEN = 500;

export interface DependenciasImagen {
  /** El router gratis-primero del OS (generateImage de media-gen), aquí simulado en pruebas. */
  generar: (prompt: string) => Promise<ResultadoRouter>;
  /** Tope por hora: se gasta UNA ficha por intento; sin ficha, no se llama al router. */
  consumirCupo?: () => CupoResult;
  /** Guarda la imagen como Entidad Única en la Biblioteca y devuelve la entidad citada. */
  guardar?: (url: string, proveedor: string) => Promise<{ id: string; version?: string } | null>;
  ahora?: () => number;
  nuevoId?: () => string;
}

export interface CapaCandidata {
  capa: Capa;
  proveedor: string;
}

export type ResultadoImagen =
  | { ok: true; candidato: CapaCandidata; mensaje: string }
  | { ok: false; mensaje: string };

const limpiarTexto = (s: string, n: number): string =>
  s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

const noDisponible = (motivo: string): ResultadoImagen => ({
  ok: false,
  mensaje: `no disponible: ${motivo.slice(0, 300)}`,
});

/** Capa `lienzo2d` CANDIDATA que cita la entidad generada (la molécula cita, nunca copia). */
function capaDeImagen(id: string, titulo: string, version: string | undefined): Capa {
  return { id, tipo: "lienzo2d", titulo, formato: "png", orden: 0, visible: true, bloqueada: false,
    referencia: { tipo: "imagen", id, version } };
}

/** Devuelve la capa CANDIDATA y su texto (o el motivo honesto); nada se aplica por sí mismo. */
export async function pedirImagen(prompt: string, deps: DependenciasImagen): Promise<ResultadoImagen> {
  const texto = typeof prompt === "string" ? limpiarTexto(prompt, MAX_PROMPT_IMAGEN) : "";
  if (!texto) return noDisponible("escribe qué imagen quieres generar.");

  if (deps.consumirCupo) {
    const cupo = deps.consumirCupo();
    if (!cupo.ok) {
      const espera = cupo.reintentoEnMin !== undefined ? `; vuelve a haber en ${cupo.reintentoEnMin} min.` : ".";
      return noDisponible(`${cupo.motivo ?? "cupo de generaciones agotado"}${espera}`);
    }
  }

  let respuesta: ResultadoRouter | null = null;
  try {
    respuesta = await deps.generar(texto);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return noDisponible(`el router de imágenes falló: ${msg}`);
  }
  if (!respuesta?.ok || typeof respuesta.url !== "string" || !respuesta.url) {
    return noDisponible(respuesta?.error || "el router de imágenes no devolvió una imagen.");
  }

  const ahora = deps.ahora?.() ?? 0;
  const proveedor = limpiarTexto(respuesta.provider ?? "router de imágenes del OS", 80);
  let id = deps.nuevoId?.() ?? `imagen-gen-${ahora}`;
  let version: string | undefined;
  if (deps.guardar) {
    try {
      const entidad = await deps.guardar(respuesta.url, proveedor);
      if (entidad?.id) { id = entidad.id; version = entidad.version; }
    } catch {
      /* sin entidad guardada: la cita queda provisional y la persona decide igual */
    }
  }
  return {
    ok: true,
    candidato: { capa: capaDeImagen(id, "Imagen generada (candidata)", version), proveedor },
    mensaje: `Imagen generada con ${proveedor}, como capa CANDIDATA: acéptala o descártala; no se ha insertado en ninguna molécula.`,
  };
}
