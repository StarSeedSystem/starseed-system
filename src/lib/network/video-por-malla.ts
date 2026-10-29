/**
 * video-por-malla — manejador PURO de `capacidad.video.render` (Ola 1018H · I).
 * La neurona que sirve valida y encola: admite solo peticiones de su misma cuenta
 * o de un grupo con permiso, rechaza GSAP editado por el OS (licencia GSAP
 * Standard, contrato §2) y recursos privados ajenos. Sin red, disco ni reloj.
 */
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";

export const VIDEO_MALLA_MAX_COMPOSICION_BYTES = 512 * 1024;
export type FormatoVideoMalla = "mp4" | "webm" | "mov" | "gif" | "png-sequence" | "hls";
export const FORMATOS_VIDEO_MALLA: readonly FormatoVideoMalla[] = ["mp4", "webm", "mov", "gif", "png-sequence", "hls"];

/** Un recurso remoto de la composición; `privado` no sale de su cuenta dueña. */
export interface RecursoVideoMalla { url: string; privado?: boolean; cuenta?: string }
/** Cuerpo de `capacidad.pedir` con tipo `render`; una ajena puede traer GSAP. */
export interface PeticionVideoMalla {
  cuenta: string; grupo?: string; composicion: string; formato?: FormatoVideoMalla;
  origen?: "os" | "ajena"; recursos?: readonly RecursoVideoMalla[];
}
export interface GrupoVideoMalla { grupo: string; miembros: readonly string[]; permiteRender: boolean }
export interface TrabajoRenderMalla {
  trabajoId: string; cuenta: string; grupo?: string; composicion: string; formato: FormatoVideoMalla;
}
/** Dependencias inyectadas: sin reloj ni azar dentro del módulo. */
export interface DepsVideoMalla {
  cuentaLocal: string; grupos?: readonly GrupoVideoMalla[];
  crearTrabajoId: () => string;
  /** Encola el trabajo; `false` si la cola está llena o no acepta más. */
  encolar: (trabajo: TrabajoRenderMalla) => boolean;
}
export type ResultadoVideoMalla =
  | { aceptado: true; trabajoId: string }
  | { aceptado: false; motivo: string };

function bytesUtf8(texto: string): number {
  return new TextEncoder().encode(texto).length;
}
function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}
function esFormatoValido(formato: unknown): formato is FormatoVideoMalla {
  return typeof formato === "string" && (FORMATOS_VIDEO_MALLA as readonly string[]).includes(formato);
}

/** ¿La cuenta puede renderizar en esta neurona? Misma cuenta o grupo con permiso. */
export function cuentaAdmitida(
  peticion: Pick<PeticionVideoMalla, "cuenta" | "grupo">,
  deps: Pick<DepsVideoMalla, "cuentaLocal" | "grupos">,
): boolean {
  if (peticion.cuenta === deps.cuentaLocal) return true;
  if (!peticion.grupo) return false;
  return (deps.grupos ?? []).some(
    (g) => g.grupo === peticion.grupo && g.permiteRender && g.miembros.includes(peticion.cuenta),
  );
}

/** Recurso privado de otra cuenta: nunca sale de las neuronas de su dueño. */
export function recursoPrivadoAjeno(
  recurso: RecursoVideoMalla,
  cuentaPeticion: string,
  cuentaLocal: string,
): boolean {
  return recurso.privado === true && recurso.cuenta !== cuentaPeticion && recurso.cuenta !== cuentaLocal;
}

/** Valida y encola una petición `capacidad.video.render`. Nunca lanza. */
export function manejarVideoPorMalla(peticion: PeticionVideoMalla, deps: DepsVideoMalla): ResultadoVideoMalla {
  try {
    if (!esObjeto(peticion) || typeof peticion.cuenta !== "string" || !peticion.cuenta) {
      return { aceptado: false, motivo: "Petición de vídeo sin cuenta." };
    }
    if (typeof peticion.composicion !== "string" || !peticion.composicion.trim()) {
      return { aceptado: false, motivo: "Petición de vídeo sin composición." };
    }
    if (bytesUtf8(peticion.composicion) > VIDEO_MALLA_MAX_COMPOSICION_BYTES) {
      return { aceptado: false, motivo: "La composición supera el tope de la malla." };
    }
    if (peticion.formato !== undefined && !esFormatoValido(peticion.formato)) {
      return { aceptado: false, motivo: "Formato de vídeo no admitido." };
    }
    if (!cuentaAdmitida(peticion, deps)) {
      return { aceptado: false, motivo: "Solo tu cuenta o un grupo con permiso de render puede pedir vídeo aquí." };
    }
    if (peticion.grupo && !deps.grupos?.some((g) => g.grupo === peticion.grupo && g.permiteRender)) {
      return { aceptado: false, motivo: "El grupo no tiene permiso de render en esta neurona." };
    }
    const { usados } = detectarAdaptadores(peticion.composicion);
    if (usados.includes("gsap") && peticion.origen !== "ajena") {
      return { aceptado: false, motivo: "El OS no edita ni genera animaciones GSAP; conviértela a WAAPI." };
    }
    for (const recurso of peticion.recursos ?? []) {
      if (recursoPrivadoAjeno(recurso, peticion.cuenta, deps.cuentaLocal)) {
        return { aceptado: false, motivo: "La composición referencia recursos privados de otra cuenta." };
      }
    }
    const trabajoId = deps.crearTrabajoId();
    if (typeof trabajoId !== "string" || !trabajoId) {
      return { aceptado: false, motivo: "No se pudo crear el trabajo de render." };
    }
    const trabajo: TrabajoRenderMalla = {
      trabajoId, cuenta: peticion.cuenta, composicion: peticion.composicion,
      formato: peticion.formato ?? "mp4", ...(peticion.grupo ? { grupo: peticion.grupo } : {}),
    };
    if (!deps.encolar(trabajo)) {
      return { aceptado: false, motivo: "La cola de render está llena o no acepta más trabajos." };
    }
    return { aceptado: true, trabajoId };
  } catch {
    return { aceptado: false, motivo: "Petición de vídeo por la malla no válida." };
  }
}
