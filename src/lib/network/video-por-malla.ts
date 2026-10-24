/*
 * video-por-malla (Ola 1018H · tarea I) — admisión pura del relé
 * `capacidad.video.render`: valida y encola el render en la neurona; la elección
 * de la neurona la hace la bolsa de recursos. Contrato:
 * architecture/video-hyperframes.md §4. Sin red, disco ni reloj reales: todo
 * entra por parámetros. Lo privado no sale de las neuronas de su dueño.
 */

import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
import { CAPACIDAD_MALLA_MAX_BYTES, bytesUtf8 } from "@/lib/network/capacidad-por-malla";

export const VIDEO_MALLA_FORMATOS = ["mp4", "webm", "mov", "gif", "png-sequence", "hls"] as const;
export type FormatoRenderVideo = (typeof VIDEO_MALLA_FORMATOS)[number];

export interface RecursoVideoMalla {
  url: string;
  cuentaId?: string;
  privado?: boolean;
}

/** La composición viaja por referencia (entidad única) o por contenido, nunca ambas. */
export interface ComposicionVideoMalla {
  html?: string;
  ref?: string;
  editadaPorOs?: boolean;
}

export interface PeticionVideoMalla {
  id: string;
  cuentaId: string;
  grupoId?: string;
  privada?: boolean;
  composicion: ComposicionVideoMalla;
  recursos?: RecursoVideoMalla[];
  formato?: FormatoRenderVideo;
}

export interface ContextoVideoMalla {
  cuentaNeurona: string;
  gruposQuePrestan?: string[];
  recursosPrivadosAjenos?: string[];
}

export type CodigoRechazoVideo =
  | "peticion-invalida"
  | "sin-permiso"
  | "gsap-en-edicion-propia"
  | "recurso-privado-ajeno"
  | "cola-rechaza";

export type ResultadoAdmisionVideo =
  | { aceptado: true; trabajoId: string; aviso?: string }
  | { aceptado: false; codigo: CodigoRechazoVideo; motivo: string };

export interface TrabajoRenderVideo {
  id: string;
  cuentaId: string;
  grupoId?: string;
  composicion: ComposicionVideoMalla;
  recursos: RecursoVideoMalla[];
  formato: FormatoRenderVideo;
  creadoEn: number;
}

export interface DepsVideoMalla {
  encolar: (trabajo: TrabajoRenderVideo) => { ok: true } | { ok: false; motivo: string };
  generarId?: () => string;
  ahora?: () => number;
}

export function validarPeticionVideoMalla(
  x: unknown,
): { ok: true; peticion: PeticionVideoMalla } | { ok: false; motivo: string } {
  return { ok: false, motivo: "pendiente" };
}

export function admiteVideoMalla(
  p: Pick<PeticionVideoMalla, "cuentaId" | "grupoId" | "privada">,
  c: ContextoVideoMalla,
): { ok: boolean; motivo: string } {
  return { ok: false, motivo: "pendiente" };
}

export function recursosAjenosVideoMalla(
  p: PeticionVideoMalla,
  c: ContextoVideoMalla,
): string[] {
  return [];
}

export function manejarPeticionVideoMalla(
  x: unknown,
  contexto: ContextoVideoMalla,
  deps: DepsVideoMalla,
): ResultadoAdmisionVideo {
  return { aceptado: false, codigo: "peticion-invalida", motivo: "pendiente" };
}
